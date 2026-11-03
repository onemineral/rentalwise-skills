/**
 * Server-side booking route for a standalone RentalWise website: the guest form was submitted,
 * now price the stay again, price the selected extras, create the booking and decide where the
 * guest goes next. Framework-agnostic: wrap `handleBook()` in a Next.js route handler, a
 * SvelteKit action, an Express handler, a serverless function, ... all server-side.
 *
 *   const rw = createRentalWiseClient({ baseURL: process.env.RENTALWISE_BASE_URL!, token: process.env.RENTALWISE_API_TOKEN! });
 *   const result = await handleBook(rw, input, { sourceName: 'www.customer.com', holdHours: 2, locale: 'fr' });
 *   // result.ok  -> respond with a redirect to result.next (or `{ next }` for a fetch-based form)
 *   // !result.ok -> respond 200 with { message, errors, notAvailable } for the form to display
 *
 * What never leaves this file: the booking record, its numeric id, `payment_link`. The browser
 * receives the redirect target only. The hidden-id URL scheme is the one of
 * `payment-page-loader.ts` (`encodeBookingToken`); swap that import for your own scheme if you
 * chose another (rentalwise-payment-page section 1).
 *
 * Mirrors the flow of rentalwise-booking sections 1, 2, 4 and 6 and the decision of the
 * reference website (thank-you when the next payment is due later, payment page when the legal
 * entity has an online payment method, thank-you otherwise).
 */
import type { createRentalWiseClient } from './rentalwise-client';
import { RentalWiseError } from './rentalwise-client';
import { encodeBookingToken } from './payment-page-loader';

type RentalWiseClient = ReturnType<typeof createRentalWiseClient>;

/* ------------------------------------------------------------------ input */

/** The search criteria the booking page received from the property page (rentalwise-quote section 5). */
export interface StayCriteria {
    property: number;
    daterange: { start: string; end: string }; // YYYY-MM-DD, end = checkout
    adults: number;
    children?: number;
    babies?: number;
    pets?: boolean;
    currency?: { iso_code: string } | { id: number };
    coupon_code?: string | null;
}

/** The guest form. `create-booking` has no city/postcode argument: fold them into `address`. */
export interface GuestForm {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    city?: string;
    postcode?: string;
    country: number; // id from country/query
    company?: string | null;
    vat_id?: string | null;
    accepted_rental_agreement?: boolean;
}

/** One line of the checkout extras, as the last `service/price-services` response echoed it. */
export interface ServiceSelection {
    service_id: number;
    quantity: number;
    guests_count?: number | null;
    duration_hours?: number | null;
    service_date?: string | null;
}

export interface BookInput {
    criteria: StayCriteria;
    guest: GuestForm;
    services?: ServiceSelection[];
    guest_message?: string | null;
    tracking?: Record<string, unknown> | null; // utm_* from a first-touch cookie
    point_of_conversion?: string | null;
}

export interface BookOptions {
    /** Label the customer sees in the PMS as the booking's origin: the site's name or domain. */
    sourceName: string;
    /** Set to auto-expire unpaid bookings (`hold: true, hold_hours`); omit for no hold. */
    holdHours?: number;
    /** Page locale; becomes the URL prefix of the redirect targets (`/fr/payment/...`). Omit for the default language. */
    locale?: string;
    /** Route the guest through the extras step (rentalwise-booking section 5) before the thank-you / payment decision. */
    extrasStep?: boolean;
    /** Translate the API's own 422 messages (en, fr, pt, ro). Your own messages are still better. */
    xLocale?: string;
    /** Paths of your pages; defaults match rentalwise-payment-page. Each receives the hidden-id ref. */
    paths?: { payment?: string; thankYou?: string; extras?: string };
}

export type BookResult =
    | { ok: true; next: string }
    | {
          ok: false;
          /** `true` when the dates went away since the guest saw the price: send them back to the property page with the inquiry option. */
          notAvailable: boolean;
          message: string;
          /** 422 `errors` map (field or rule name -> messages); empty for a not-available outcome. */
          errors: Record<string, string[]>;
      };

const NOT_AVAILABLE_KEYS = ['rates_defined', 'availability', 'property_booked'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ route */

export async function handleBook(rw: RentalWiseClient, input: BookInput, options: BookOptions): Promise<BookResult> {
    const invalid = validateInput(input);
    if (invalid) return invalid;

    const { criteria, guest } = input;
    const headers = options.xLocale ? { 'x-locale': options.xLocale } : undefined;
    const quoteParams = {
        property: criteria.property,
        daterange: criteria.daterange,
        adults: criteria.adults,
        children: criteria.children ?? 0,
        babies: criteria.babies ?? 0,
        pets: Boolean(criteria.pets),
        ...(criteria.currency ? { currency: criteria.currency } : {}),
        ...(criteria.coupon_code ? { coupon_code: criteria.coupon_code } : {}),
    };

    // The property, with the relations this route needs and the quote does not guarantee.
    const property = await rw.post('property/fetch', {
        id: criteria.property,
        with: ['rental_agreement', 'legal_entity', 'policies'],
        no_auto_relations: true,
    });
    if (!property || property.status !== 'enabled' || property.website_visible !== true) {
        return { ok: false, notAvailable: true, message: 'This property cannot be booked online.', errors: {} };
    }
    if (property.rental_agreement && !guest.accepted_rental_agreement) {
        return { ok: false, notAvailable: false, message: 'Please accept the rental agreement.', errors: { rental_agreement: ['The rental agreement must be accepted.'] } };
    }

    // 1. Fresh quote (rentalwise-booking section 1): its quote_id is the price the guest pays.
    let quote: any;
    try {
        quote = await rw.post('property/get-quote', quoteParams, { headers });
    } catch (e) {
        return mapValidation(e, 'quote');
    }
    if (Array.isArray(quote.exceptions) && quote.exceptions.length > 0) {
        return { ok: false, notAvailable: true, message: 'The property is not available for the selected dates.', errors: {} };
    }

    // 2. Extras selected on the checkout page, re-priced against this quote (section 2).
    let priced: any = null;
    if (input.services && input.services.length > 0) {
        try {
            priced = await rw.post('service/price-services', { ...quoteParams, quote_id: quote.quote_id, services: input.services }, { headers });
        } catch (e) {
            return mapValidation(e, 'services');
        }
        const estimate = (priced.services as any[]).find((s) => s.is_price_estimate);
        if (estimate) {
            return { ok: false, notAvailable: false, message: 'This service is priced on request and cannot be booked online.', errors: { services: ['Remove the on-request service and add it after the booking instead.'] } };
        }
    }

    // 4. Create the booking with the quote's own criteria, the priced lines and the main guest.
    let booking: any;
    try {
        booking = await rw.post('property/create-booking', {
            ...quote.search_criteria, // property, daterange, adults, children, babies, pets, currency, coupon_code
            quote_id: quote.quote_id,
            ...(priced
                ? {
                      services: (priced.services as any[]).map(({ service_id, quantity, guests_count, duration_hours, service_date }) => ({
                          service_id, quantity, guests_count, duration_hours, service_date,
                      })),
                      services_quote_id: priced.services_quote_id,
                  }
                : {}),
            guests: [guestRecord(guest)],
            guest_message: input.guest_message ?? null,
            ...(options.holdHours && options.holdHours > 0 ? { hold: true, hold_hours: options.holdHours } : {}),
            ...(input.tracking ? { tracking: input.tracking } : {}),
            ...(input.point_of_conversion ? { point_of_conversion: input.point_of_conversion } : {}),
            source_name: options.sourceName,
        }, { headers });
    } catch (e) {
        return mapValidation(e, 'booking');
    }

    // 5 / 6. Where the guest goes next. The browser gets this path and nothing else.
    const next = await nextStepAfterBooking(rw, booking, property.legal_entity?.id ?? null, options);
    return { ok: true, next };
}

/* ------------------------------------------------------------------ decision (section 6) */

/**
 * Thank-you when the next payment is due later; otherwise the payment page when the property's
 * legal entity has an online payment method the website may use; thank-you otherwise. Also the
 * entry point after `booking/add-services`, with the booking that call returned.
 */
export async function nextStepAfterBooking(
    rw: RentalWiseClient,
    booking: any,
    legalEntityId: number | null,
    options: Pick<BookOptions, 'locale' | 'extrasStep' | 'paths'>,
): Promise<string> {
    const ref = encodeBookingToken(booking.id);
    const prefix = options.locale ? `/${options.locale}` : '';
    const paths = { payment: '/payment', thankYou: '/payment', extras: '/booking/extras', ...options.paths };
    const thankYou = `${prefix}${paths.thankYou}/${ref}/thank-you`;

    if (options.extrasStep && isOpenForExtras(booking)) {
        return `${prefix}${paths.extras}/${ref}`;
    }
    if (isDueLater(booking.next_payment_due_date)) {
        return thankYou; // first schedule step is later: instant-book and request-to-book alike
    }
    if (!(await hasOnlinePaymentMethod(rw, legalEntityId))) {
        return thankYou; // the booking exists; the customer collects payment offline
    }
    return `${prefix}${paths.payment}/${ref}`; // request-to-book included: the widget captures the payment method
}

/** `payment-method/query` for the legal entity: enabled and shown on the website. A failed check counts as "no". */
export async function hasOnlinePaymentMethod(rw: RentalWiseClient, legalEntityId: number | null): Promise<boolean> {
    if (!legalEntityId) return false;
    try {
        const page = await rw.post('payment-method/query', {
            where: {
                conditions: [
                    { field: 'legal_entity.id', eq: legalEntityId },
                    { field: 'status', in: ['enabled'] },
                    { field: 'show_on_website', eq: true },
                ],
            },
            paginate: { page: 1, perpage: 1 },
            no_auto_relations: true,
        });
        return Array.isArray(page?.data) && page.data.length > 0;
    } catch {
        return false;
    }
}

/** `next_payment_due_date` (YYYY-MM-DD) strictly after today's UTC date. */
export function isDueLater(dueDate: unknown, now: Date = new Date()): boolean {
    if (typeof dueDate !== 'string' || !ISO_DATE.test(dueDate.slice(0, 10))) return false;
    const today = now.toISOString().slice(0, 10);
    return dueDate.slice(0, 10) > today;
}

/** Still open for the extras step of section 5: unpaid and pending. */
export function isOpenForExtras(b: { status: string; payment_status?: string | null }): boolean {
    const open = ['pending_payment', 'hold', 'pending_host_confirmation'].includes(b.status);
    return open && (!b.payment_status || b.payment_status === 'unpaid');
}

/* ------------------------------------------------------------------ helpers */

function validateInput(input: BookInput): BookResult | null {
    const c = input.criteria;
    const errors: Record<string, string[]> = {};
    if (!Number.isInteger(c?.property) || c.property <= 0) errors.property = ['Invalid property.'];
    if (!c?.daterange || !ISO_DATE.test(c.daterange.start ?? '') || !ISO_DATE.test(c.daterange.end ?? '')) {
        errors.daterange = ['Check-in and check-out dates are required.'];
    } else if (c.daterange.end <= c.daterange.start) {
        errors['daterange.end'] = ['Check-out must be after check-in.'];
    } else if (c.daterange.start < new Date().toISOString().slice(0, 10)) {
        errors['daterange.start'] = ['Check-in cannot be in the past.'];
    }
    if (!Number.isInteger(c?.adults) || c.adults < 1) errors.adults = ['At least one adult is required.'];
    const g = input.guest;
    for (const field of ['first_name', 'last_name', 'email', 'phone', 'address'] as const) {
        if (!g?.[field] || String(g[field]).trim() === '') errors[field] = ['This field is required.'];
    }
    if (!Number.isInteger(g?.country)) errors.country = ['Country is required.'];
    if (input.services?.some((s) => !Number.isInteger(s.service_id) || !Number.isInteger(s.quantity) || s.quantity < 1)) {
        errors.services = ['Invalid service selection.'];
    }
    if (Object.keys(errors).length === 0) return null;
    return { ok: false, notAvailable: false, message: 'Please check the form.', errors };
}

/** `create-booking` guest: no city/postcode arguments exist, so they go into `address` lines. */
function guestRecord(g: GuestForm) {
    const address = [g.address, [g.postcode, g.city].filter(Boolean).join(' ')].filter((l) => l && l.trim()).join('\n');
    return {
        first_name: g.first_name,
        last_name: g.last_name,
        email: g.email,
        phone: g.phone,
        address,
        country: g.country,
        company: g.company || null,
        vat_id: g.vat_id || null,
    };
}

/** 422 -> form result; not-available rule keys collapse into one outcome (rentalwise-quote section 4). Anything else is rethrown. */
function mapValidation(e: unknown, step: 'quote' | 'services' | 'booking'): BookResult {
    if (!(e instanceof RentalWiseError) || e.statusCode !== 422) throw e;
    const errors: Record<string, string[]> = e.responseBody?.errors ?? {};
    const ruleKeys = Object.keys(errors).filter((k) => !NOT_AVAILABLE_KEYS.includes(k));
    const notAvailable = Object.keys(errors).some((k) => NOT_AVAILABLE_KEYS.includes(k)) && ruleKeys.length === 0;
    if (notAvailable) {
        return { ok: false, notAvailable: true, message: 'The property is no longer available for the selected dates.', errors: {} };
    }
    const kept: Record<string, string[]> = {};
    for (const k of ruleKeys) kept[k] = errors[k];
    const message = step === 'services' ? 'Please review the selected extras.' : ruleKeys.length ? kept[ruleKeys[0]][0] : String(e.responseBody?.message ?? 'The given data was invalid.');
    return { ok: false, notAvailable: false, message, errors: kept };
}
