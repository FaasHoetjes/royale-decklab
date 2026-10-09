namespace RoyaleDeckLab.Api.Models;

public static class DomainMath
{
    /// <summary>
    /// Cautious deck strength: the <paramref name="quantile"/> of the deck's posterior win rate,
    /// Beta(wins + m·k, losses + (1 − m)·k) for a prior of k = <paramref name="priorGames"/> imaginary games
    /// at m = <paramref name="priorWinRate"/>. Ranking by a low quantile rather than the mean is the usual guard
    /// against the winner's curse: the best-looking records among thousands of decks are mostly lucky.
    /// </summary>
    public static double PosteriorQuantile(
        double wins, double games, double priorGames, double priorWinRate, double quantile)
        => InverseRegularizedBeta(
            wins + priorWinRate * priorGames,
            games - wins + (1 - priorWinRate) * priorGames,
            quantile);

    /// <summary>The x with I_x(a, b) = p: the p-quantile of Beta(a, b). Newton steps kept inside a bisection bracket.</summary>
    public static double InverseRegularizedBeta(double a, double b, double p)
    {
        if (p <= 0) return 0;
        if (p >= 1) return 1;

        var logBeta = LogGamma(a) + LogGamma(b) - LogGamma(a + b);
        double lo = 0, hi = 1;

        // Start from the normal approximation, which is already close for the evidence sizes seen here.
        var mean = a / (a + b);
        var sd = Math.Sqrt(a * b / ((a + b) * (a + b) * (a + b + 1)));
        var x = Math.Clamp(mean + NormalQuantile(p) * sd, 1e-9, 1 - 1e-9);

        for (var i = 0; i < 200; i++)
        {
            var f = RegularizedIncompleteBeta(a, b, x) - p;
            if (f < 0) lo = x; else hi = x;

            var density = Math.Exp((a - 1) * Math.Log(x) + (b - 1) * Math.Log(1 - x) - logBeta);
            var next = density > 0 ? x - f / density : double.NaN;
            if (!(next > lo && next < hi))
            {
                next = (lo + hi) / 2;
            }

            if (Math.Abs(next - x) < 1e-13)
            {
                return next;
            }
            x = next;
        }
        return x;
    }

    /// <summary>I_x(a, b), the Beta(a, b) CDF, via the continued fraction (Numerical Recipes betai/betacf).</summary>
    public static double RegularizedIncompleteBeta(double a, double b, double x)
    {
        if (x <= 0) return 0;
        if (x >= 1) return 1;

        var front = Math.Exp(LogGamma(a + b) - LogGamma(a) - LogGamma(b) + a * Math.Log(x) + b * Math.Log(1 - x));
        return x < (a + 1) / (a + b + 2)
            ? front * BetaContinuedFraction(a, b, x) / a
            : 1 - front * BetaContinuedFraction(b, a, 1 - x) / b;
    }

    private static double BetaContinuedFraction(double a, double b, double x)
    {
        const double tiny = 1e-300;
        var c = 1.0;
        var d = 1 - (a + b) * x / (a + 1);
        if (Math.Abs(d) < tiny) d = tiny;
        d = 1 / d;
        var h = d;

        for (var m = 1; m <= 10_000; m++)
        {
            var m2 = 2 * m;
            var aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
            d = 1 + aa * d;
            if (Math.Abs(d) < tiny) d = tiny;
            c = 1 + aa / c;
            if (Math.Abs(c) < tiny) c = tiny;
            d = 1 / d;
            h *= d * c;

            aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
            d = 1 + aa * d;
            if (Math.Abs(d) < tiny) d = tiny;
            c = 1 + aa / c;
            if (Math.Abs(c) < tiny) c = tiny;
            d = 1 / d;
            var delta = d * c;
            h *= delta;
            if (Math.Abs(delta - 1) < 1e-15)
            {
                break;
            }
        }
        return h;
    }

    private static readonly double[] Lanczos =
    [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
        -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
        1.5056327351493116e-7,
    ];

    /// <summary>ln Γ(x) for x &gt; 0 (Lanczos, g = 7).</summary>
    public static double LogGamma(double x)
    {
        if (x < 0.5)
        {
            return Math.Log(Math.PI / Math.Sin(Math.PI * x)) - LogGamma(1 - x);
        }

        x -= 1;
        var sum = Lanczos[0];
        for (var i = 1; i < Lanczos.Length; i++)
        {
            sum += Lanczos[i] / (x + i);
        }
        var t = x + 7.5;
        return 0.5 * Math.Log(2 * Math.PI) + (x + 0.5) * Math.Log(t) - t + Math.Log(sum);
    }

    /// <summary>Standard normal quantile (Acklam's rational approximation, ~1e-9); only seeds the Beta inversion.</summary>
    private static double NormalQuantile(double p)
    {
        double[] a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
        double[] b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
        double[] c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
        double[] d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];

        if (p < 0.02425)
        {
            var q = Math.Sqrt(-2 * Math.Log(p));
            return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
                   ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        }
        if (p > 1 - 0.02425)
        {
            return -NormalQuantile(1 - p);
        }

        var r = p - 0.5;
        var s = r * r;
        return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r /
               (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
    }
}
