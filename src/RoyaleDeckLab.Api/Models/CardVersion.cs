namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// The special version a single card was fielded as in a deck. Serialised to the
/// client as <c>{ cardId, version }</c> with <c>version</c> one of "normal" |
/// "evo" | "hero" (the string-enum converter registered in Program.cs handles the
/// wire mapping).
/// </summary>
public sealed record CardVersion(int CardId, CardVersionKind Version);
