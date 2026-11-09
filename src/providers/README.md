# Game catalog providers

Explore reads game metadata through the `GameProvider` interface in `catalog.ts`. A provider supplies a stable ID, display name, attribution link, and an async `getGames()` method that returns normalized `CatalogGame` records.

To add a provider:

1. Implement `GameProvider` and map the source response to `CatalogGame` in `catalog.ts`.
2. Add the provider to the `gameProviders` array.
3. Keep source-specific API calls and response types in that provider's adapter or a TanStack Start server function when the source needs server-side fetching.

The Explore page only depends on `GameProvider` and `CatalogGame`; it does not need provider-specific changes. Keep an attribution link visible for each source and check its terms before using its data.
