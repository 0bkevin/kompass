import { providerAttributionsForReference } from "../lib/provider-attribution.mjs";

export function ProviderCredits({ reference }: { reference: unknown }) {
  const providers = providerAttributionsForReference(reference);
  if (!providers.length) return null;
  return (
    <p
      className="small muted provider-credits"
      style={{ margin: "8px 0", overflowWrap: "anywhere", lineHeight: 1.65 }}
    >
      Datos:{" "}
      {providers.map((provider, index) => (
        <span key={provider.id}>
          {index > 0 ? " · " : ""}
          <a href={provider.url} target="_blank" rel="noreferrer">
            {provider.name}
          </a>
        </span>
      ))}
    </p>
  );
}
