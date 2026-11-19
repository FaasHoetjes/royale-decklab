namespace RoyaleDeckLab.Api.Services.Crawling;

public sealed class SeedPicks<TSource>(int limit, Func<string, bool> isDue, Func<int> readsLeft) where TSource : struct, Enum
{
    private readonly List<string> _tags = [];
    private readonly Dictionary<string, TSource> _sourceByTag = new(StringComparer.Ordinal);
    private int _taken;

    public IReadOnlyList<string> Tags => _tags;

    public bool HasRoom => _tags.Count < limit && _tags.Count - _taken < readsLeft();

    public Dictionary<TSource, int> CountBySource { get; } = [];

    public IEnumerable<string> TagsFrom(TSource source)
        => _sourceByTag
            .Where(s => EqualityComparer<TSource>.Default.Equals(s.Value, source))
            .Select(s => s.Key);

    /// <returns>Whether every tag due fit.</returns>
    public bool Pick(TSource source, IEnumerable<string> tags)
    {
        foreach (var tag in tags)
        {
            if (!HasRoom)
            {
                return false;
            }
            if (!isDue(tag) || !_sourceByTag.TryAdd(tag, source))
            {
                continue;
            }
            _tags.Add(tag);
            CountBySource[source] = CountBySource.GetValueOrDefault(source) + 1;
        }
        return true;
    }

    public IReadOnlyList<string> TakeNew()
    {
        var picked = _tags[_taken..];
        _taken = _tags.Count;
        return picked;
    }
}
