/**
 * One line of JSON per notable event, for `wrangler tail` and the Workers
 * Logs dashboard. Counts and ids only: no names, answers or secrets.
 */
export function logEvent(event: string, fields: Record<string, string | number | boolean | null> = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}
