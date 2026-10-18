export interface ProviderAttribution {
  id: string;
  name: string;
  url: string;
}
export function providerAttributionsForReference(
  reference: unknown,
): ProviderAttribution[];
export function formatProviderAttributions(...references: unknown[]): string;
