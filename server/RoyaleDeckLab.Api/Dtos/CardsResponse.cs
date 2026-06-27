namespace RoyaleDeckLab.Api.Dtos;

/// <summary>The /cards response envelope ({ items: [...] }).</summary>
public sealed record CardsResponse(List<CatalogCard> Items);
