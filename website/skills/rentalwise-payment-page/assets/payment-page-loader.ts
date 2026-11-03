/**
 * Server-side loader for the payment and thank-you pages.
 *
 * - Resolves the URL segment to a booking id. The scheme here is ONE EXAMPLE: an encrypted
 *   token (AES-256-GCM with a server key, base64url). If the site hides the id another way
 *   (a random key stored next to the id, a session, ...), replace `encodeBookingToken` /
 *   `decodeBookingToken` with that lookup; nothing else in this file depends on it.
 * - Fetches the booking by id with `booking/fetch`, derives the page state, creates the
 *   widget client secret when something is due, and returns only what the page shows.
 *
 * Usage (Next.js route handler, SvelteKit load, Express handler, ... all server-side):
 *
 *   const rw = createRentalWiseClient({ baseURL: process.env.RENTALWISE_BASE_URL!, token: process.env.RENTALWISE_API_TOKEN! });
 *   const page = await loadPaymentPage(rw, params.ref, { siteUrl: process.env.SITE_URL!, withWidget: true, locale, defaultLocale });
 *   // `locale` is the page language (also the URL prefix of the return URLs); `defaultLocale` is the
 *   // account's `is_default` language from language/query. Translated maps are resolved page locale ->
 *   // default -> any non-blank value, as in rentalwise-languages-and-translations.
 *   if (!page) notFound();
 *
 * Right after create-booking:  redirect(`/payment/${encodeBookingToken(booking.id)}`)
 *
 * Environment: RENTALWISE_BASE_URL, RENTALWISE_API_TOKEN (see rentalwise-api-auth),
 * PAYMENT_TOKEN_KEY (32 random bytes, hex or base64; `openssl rand -hex 32`), SITE_URL.
 * None of them has a public prefix. This file must never be imported by browser code.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { createRentalWiseClient } from './rentalwise-client';
import { RentalWiseError } from './rentalwise-client';

type RentalWiseClient = ReturnType<typeof createRentalWiseClient>;

/* ------------------------------------------------------------------ token */

function tokenKey(): Buffer {
    const raw = process.env.PAYMENT_TOKEN_KEY;
    if (!raw) throw new Error('PAYMENT_TOKEN_KEY is not set');
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('PAYMENT_TOKEN_KEY must be 32 bytes (hex or base64)');
    return key;
}

/** Example scheme: 12-byte IV + ciphertext + 16-byte tag, base64url. Stateless. */
export function encodeBookingToken(bookingId: number): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv);
    const body = Buffer.concat([cipher.update(`b:${bookingId}`, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url');
}

/** Returns the booking id, or null for anything that was not produced by encodeBookingToken. */
export function decodeBookingToken(token: string): number | null {
    if (typeof token !== 'string' || token.length < 40 || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
    try {
        const buf = Buffer.from(token, 'base64url');
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(buf.length - 16);
        const body = buf.subarray(12, buf.length - 16);
        const decipher = createDecipheriv('aes-256-gcm', tokenKey(), iv);
        decipher.setAuthTag(tag);
        const text = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
        const m = /^b:(\d{1,12})$/.exec(text);
        return m ? Number(m[1]) : null;
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ types */

type Translated = Record<string, string> | string;

export type PaymentPageBooking = {
    state: 'inactive' | 'nothing_due' | 'payable';
    ref: string;
    status: string;
    paymentStatus: string;
    bookingCategory: string | null;
    checkin: string;
    checkout: string;
    nights: number;
    adults: number;
    children: number;
    babies: number;
    pets: boolean;
    currency: string;
    total: number;
    totalPaid: number;
    totalOutstanding: number;
    amountDue: number;
    nextPaymentDueDate: string | null;
    expiresAt: string | null;
    lines: { name: string; type: string; total: number }[];
    /** extras requested by the guest and not yet confirmed by the host; not part of `total` */
    pendingServices: { name: string; quantity: number; total: number | null; isEstimate: boolean; pricingNotes: Translated | null }[];
    schedule: { label: string; dueDate: string | null; amount: number; isPaid: boolean }[];
    guestFirstName: string | null;
    property: {
        name: Translated;
        image: string | null;
        bedrooms: number | null;
        bathrooms: number | null;
        maxOccupancy: number | null;
        area: string | null;
        address: string | null;
        securityDeposit: number;
        securityDepositCurrency: string | null;
        rentalAgreement: Translated | null;
        contact: { name: string | null; phone: string | null; email: string | null };
    };
    widget: { clientSecret: string; instance: string; bookingId: number } | null;
};

const PAYABLE_STATUSES = ['hold', 'pending_payment', 'pending_host_confirmation', 'confirmed'];

const BOOKING_RELATIONS = [
    'property.main_image',
    'property.location',
    'property.legal_entity',
    'property.rental_agreement',
    'property.rates_settings',
    'products',
    'service_requests',
    'service_requests.service',
    'payment_schedule_steps',
    'currency',
    'main_guest',
];

/* ------------------------------------------------------------------ loader */

export async function loadPaymentPage(
    rw: RentalWiseClient,
    ref: string,
    options: { siteUrl: string; withWidget: boolean; locale?: string; defaultLocale?: string },
): Promise<PaymentPageBooking | null> {
    const bookingId = decodeBookingToken(ref);
    if (bookingId === null) return null; // does not resolve: no API call

    let booking: any;
    try {
        booking = await rw.post('booking/fetch', { id: bookingId, with: BOOKING_RELATIONS, no_auto_relations: true });
    } catch (e) {
        if (e instanceof RentalWiseError && (e.statusCode === 404 || e.statusCode === 422)) return null;
        throw e;
    }

    const amountDue = pickAmountDue(booking);
    const state: PaymentPageBooking['state'] = !PAYABLE_STATUSES.includes(booking.status)
        ? 'inactive'
        : booking.payment_status === 'paid' || amountDue <= 0
          ? 'nothing_due'
          : 'payable';

    let widget: PaymentPageBooking['widget'] = null;
    if (state === 'payable' && options.withWidget) {
        const base = options.siteUrl.replace(/\/+$/, '');
        const prefix = options.locale ? `/${options.locale}` : '';
        const secret = await rw.post<{ data: { client_secret: string; instance: string } }>('payment/create-client-secret', {
            booking: booking.id,
            return_url_ok: `${base}${prefix}/payment/${ref}/thank-you`,
            return_url_ko: `${base}${prefix}/payment/${ref}?status=ko`,
        });
        widget = { clientSecret: secret.data.client_secret, instance: secret.data.instance, bookingId: booking.id };
    }

    const property = booking.property ?? {};
    const { locale, defaultLocale } = options;
    const products: any[] = Array.isArray(booking.products) ? booking.products : (booking.products?.data ?? []);
    // extras still waiting for the host (on request / estimates); confirmed ones are already `products` of type 'service'
    const requests: any[] = Array.isArray(booking.service_requests)
        ? booking.service_requests
        : (booking.service_requests?.data ?? []);
    const steps: any[] = Array.isArray(booking.payment_schedule_steps)
        ? booking.payment_schedule_steps
        : (booking.payment_schedule_steps?.data ?? []);

    return {
        state,
        ref,
        status: booking.status,
        paymentStatus: booking.payment_status,
        bookingCategory: booking.booking_category ?? null,
        checkin: booking.checkin,
        checkout: booking.checkout,
        nights: booking.length_of_stay,
        adults: booking.adults ?? 0,
        children: booking.children ?? 0,
        babies: booking.babies ?? 0,
        pets: Boolean(booking.pets),
        currency: booking.currency?.iso_code,
        total: num(booking.total),
        totalPaid: num(booking.total_paid),
        totalOutstanding: num(booking.total_outstanding),
        amountDue,
        nextPaymentDueDate: booking.next_payment_due_date ?? null,
        expiresAt: booking.status === 'hold' ? (booking.expires_at ?? null) : null,
        lines: products.map((p) => ({ name: String(p.name ?? ''), type: String(p.type ?? ''), total: num(p.total) })),
        pendingServices: requests
            .filter((r) => r.status === 'requested')
            .map((r) => ({
                name: resolveText(r.name, locale, defaultLocale) ?? '',
                quantity: Number(r.quantity ?? 1),
                total: r.total == null ? null : num(r.total),
                isEstimate: Boolean(r.is_price_estimate),
                pricingNotes: r.pricing_notes ?? null, // map; the page resolves it like `property.name`
            })),
        schedule: steps.map((s) => ({
            label: s.short_description || s.type || '',
            dueDate: s.due_date ?? null,
            amount: num(s.amount),
            isPaid: Boolean(s.is_paid),
        })),
        guestFirstName: booking.main_guest?.first_name ?? null,
        property: {
            name: property.name ?? '',
            image: property.main_image?.thumbnail ?? null,
            bedrooms: property.bedrooms ?? null,
            bathrooms: property.bathrooms ?? null,
            maxOccupancy: property.max_occupancy ?? null,
            area: resolveText(property.location?.name, locale, defaultLocale),
            address: property.show_exact_address ? (property.address ?? null) : null,
            securityDeposit: num(property.rates_settings?.security_deposit),
            securityDepositCurrency: property.currency?.iso_code ?? booking.currency?.iso_code ?? null,
            rentalAgreement: property.rental_agreement?.contents ?? null,
            contact: {
                name: property.legal_entity?.legal_name ?? property.legal_entity?.business_name ?? null,
                phone: property.legal_entity?.phone ?? null,
                email: property.legal_entity?.email ?? null,
            },
        },
        widget,
    };
}

/* ------------------------------------------------------------------ helpers */

function pickAmountDue(b: any): number {
    const next = num(b.next_payment_amount);
    return next > 0 ? next : num(b.total_outstanding);
}

function num(v: unknown): number {
    const n = typeof v === 'string' ? parseFloat(v) : (v as number);
    return Number.isFinite(n) ? (n as number) : 0;
}

/** Page locale -> account default language -> first non-blank value. No hard-coded language. */
function resolveText(v: unknown, locale?: string, defaultLocale?: string): string | null {
    if (!v) return null;
    if (typeof v === 'string') return v;
    const map = v as Record<string, string | null | undefined>;
    const blank = (s: unknown) => typeof s !== 'string' || s.trim() === '';
    for (const key of [locale, defaultLocale]) {
        if (key && !blank(map[key])) return map[key] as string;
    }
    return (Object.values(map).find((s) => !blank(s)) as string | undefined) ?? null;
}
