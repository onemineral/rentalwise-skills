/**
 * Minimal RentalWise REST client without dependencies. Server-side only: it needs the API token.
 *
 *   const rw = createRentalWiseClient({ baseURL: process.env.RENTALWISE_BASE_URL!, token: process.env.RENTALWISE_API_TOKEN! });
 *   const page = await rw.post<Paginated<Property>>('property/search', { guests: 2, paginate: { page: 1, perpage: 20 } });
 *   const quote = await rw.post<Quote>('property/get-quote', { property: 12, daterange: { start, end }, adults: 2 });
 *   // extra request headers, e.g. translated 422 messages:
 *   await rw.post('property/get-quote', params, { headers: { 'x-locale': 'fr' } });
 */
export interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    from: number | null; // null when `data` is empty
    to: number | null;
    total: number;
}

export class RentalWiseError extends Error {
    constructor(
        public readonly path: string,
        public readonly statusCode: number,
        public readonly responseBody: any,
    ) {
        super(`RentalWise ${path} failed with ${statusCode}: ${responseBody?.message ?? 'unknown error'}`);
    }

    /** True for 422 responses; `errors` is then a map of field/rule name to messages. */
    get isValidation() {
        return this.statusCode === 422;
    }

    /** All validation messages flattened, for display. */
    get messages(): string[] {
        const errors = this.responseBody?.errors;
        if (!errors) return this.responseBody?.message ? [this.responseBody.message] : [];
        return Array.isArray(errors) ? errors.flat() : Object.values(errors as Record<string, string[]>).flat();
    }
}

export function createRentalWiseClient(config: { baseURL: string; token: string; fetchImpl?: typeof fetch }) {
    const base = config.baseURL.endsWith('/') ? config.baseURL : `${config.baseURL}/`;
    const doFetch = config.fetchImpl ?? fetch;

    // The token must never reach a browser. If this file ends up in a client bundle, fail at
    // runtime instead of silently sending the customer's credentials to every visitor.
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        throw new Error('createRentalWiseClient must only run on the server: it holds the API token');
    }

    if (!config.token) {
        throw new Error('RentalWise token is missing');
    }

    return {
        async post<T = any>(
            path: string,
            body: Record<string, unknown> = {},
            options: { headers?: Record<string, string> } = {},
        ): Promise<T> {
            const res = await doFetch(`${base}${path.replace(/^\//, '')}`, {
                method: 'POST',
                headers: {
                    ...options.headers, // listed first: the auth and content headers below cannot be overridden
                    Authorization: `Bearer ${config.token}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(body),
            });

            const text = await res.text();
            let json: any = null;
            try {
                json = text ? JSON.parse(text) : null;
            } catch {
                json = { message: text };
            }

            if (!res.ok) {
                throw new RentalWiseError(path, res.status, json);
            }

            return json as T;
        },
    };
}
