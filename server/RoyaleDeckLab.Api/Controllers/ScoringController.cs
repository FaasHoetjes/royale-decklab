using Microsoft.AspNetCore.Mvc;

namespace RoyaleDeckLab.Api.Controllers;

/// <summary>
/// Scoring endpoints (player war decks, builder scoring, best-decks). These
/// depend on the DeckAnalyzer port — slice 2. Stubbed with 501 so the contract
/// surface is present and the frontend gets a clear signal until they land.
/// </summary>
[ApiController]
public sealed class ScoringController : ControllerBase
{
    private IActionResult NotYet(string what)
        => StatusCode(501, new { error = $"{what} is not ported yet (slice 2: DeckAnalyzer)." });

    [HttpGet("api/player/{tag}/collection")]
    public IActionResult PlayerCollection(string tag) => NotYet("Player collection");

    [HttpGet("api/player/{tag}")]
    public IActionResult PlayerWarDecks(string tag) => NotYet("Player war decks");

    [HttpPost("api/score-decks")]
    public IActionResult ScoreDecks() => NotYet("Deck scoring");

    [HttpGet("api/best-decks")]
    public IActionResult BestDecks() => NotYet("Best decks");
}
