namespace RoyaleDeckLab.Api.Models;

public enum BalanceChangeKind
{
    Buff,
    Nerf,
    Rework
}

/// <summary>One card's change in a balance update: its stat changes, without Supercell's reasoning.</summary>
public sealed record BalanceChange(int CardId, CardVersionKind Version, BalanceChangeKind Kind, string Summary);

/// <summary>A balance update as Supercell shipped it: the day it went live and a link to the official notes.</summary>
public sealed record BalanceUpdate(DateOnly LiveFrom, string NotesUrl, IReadOnlyList<BalanceChange> Changes);

/// <summary>
/// A change as the notes name it, such as "Cannon Evolution" or "Mortar &amp; Mortar Evolution", matched to cards
/// only when shown, so a card the catalog doesn't know yet still turns up once it does.
/// </summary>
public sealed record PostedChange(string Title, BalanceChangeKind Kind, string Summary);

public sealed record PostedUpdate(DateOnly Day, string NotesUrl, IReadOnlyList<PostedChange> Changes);
