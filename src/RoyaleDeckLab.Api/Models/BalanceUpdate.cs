namespace RoyaleDeckLab.Api.Models;

public enum BalanceChangeKind
{
    Buff,
    Nerf,
    Rework
}

/// <summary>One card's change in a balance update, summarised in our own words.</summary>
public sealed record BalanceChange(int CardId, CardVersionKind Version, BalanceChangeKind Kind, string Summary);

/// <summary>A balance update as Supercell shipped it: the day it went live and a link to the official notes.</summary>
public sealed record BalanceUpdate(DateOnly LiveFrom, string NotesUrl, IReadOnlyList<BalanceChange> Changes);
