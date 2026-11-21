namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// A conditional logit, fitted by Newton's method: each choice picks one of its alternatives with odds that grow by
/// exp(coefficient) per unit of each variable.
/// </summary>
public static class ConditionalLogit
{
    public sealed record Choice(IReadOnlyList<double[]> Alternatives, int Chosen);

    private const int MaxIterations = 30;
    private const double Tolerance = 1e-9;

    public static (double[] Coefficients, double[,] Covariance) Fit(IReadOnlyList<Choice> choices)
    {
        var k = choices[0].Alternatives[0].Length;
        var coefficients = new double[k];
        var information = new double[k, k];
        for (var iteration = 0; iteration < MaxIterations; iteration++)
        {
            var gradient = new double[k];
            information = new double[k, k];
            foreach (var choice in choices)
            {
                Accumulate(choice, coefficients, gradient, information);
            }

            var step = Multiply(Invert(information), gradient);
            for (var j = 0; j < k; j++)
            {
                coefficients[j] += step[j];
            }
            if (step.Max(Math.Abs) < Tolerance)
            {
                break;
            }
        }
        return (coefficients, Invert(information));
    }

    private static void Accumulate(Choice choice, double[] coefficients, double[] gradient, double[,] information)
    {
        var k = coefficients.Length;
        var alternatives = choice.Alternatives;
        var scores = alternatives.Select(x => x.Select((v, j) => v * coefficients[j]).Sum()).ToArray();
        var top = scores.Max();
        var weights = scores.Select(s => Math.Exp(s - top)).ToArray();
        var total = weights.Sum();

        var expected = new double[k];
        for (var i = 0; i < alternatives.Count; i++)
        {
            for (var j = 0; j < k; j++)
            {
                expected[j] += weights[i] / total * alternatives[i][j];
            }
        }
        for (var a = 0; a < k; a++)
        {
            gradient[a] += alternatives[choice.Chosen][a] - expected[a];
            for (var b = 0; b < k; b++)
            {
                var moment = 0.0;
                for (var i = 0; i < alternatives.Count; i++)
                {
                    moment += weights[i] / total * alternatives[i][a] * alternatives[i][b];
                }
                information[a, b] += moment - expected[a] * expected[b];
            }
        }
    }

    private static double[] Multiply(double[,] matrix, double[] vector)
    {
        var result = new double[vector.Length];
        for (var i = 0; i < vector.Length; i++)
        {
            for (var j = 0; j < vector.Length; j++)
            {
                result[i] += matrix[i, j] * vector[j];
            }
        }
        return result;
    }

    private static double[,] Invert(double[,] matrix)
    {
        var n = matrix.GetLength(0);
        var work = new double[n, 2 * n];
        for (var i = 0; i < n; i++)
        {
            for (var j = 0; j < n; j++)
            {
                work[i, j] = matrix[i, j];
            }
            work[i, n + i] = 1;
        }

        for (var col = 0; col < n; col++)
        {
            var pivot = col;
            for (var row = col + 1; row < n; row++)
            {
                if (Math.Abs(work[row, col]) > Math.Abs(work[pivot, col]))
                {
                    pivot = row;
                }
            }
            if (work[pivot, col] == 0)
            {
                throw new InvalidOperationException("The variables don't vary independently");
            }
            for (var j = 0; j < 2 * n; j++)
            {
                (work[col, j], work[pivot, j]) = (work[pivot, j], work[col, j]);
            }
            var scale = work[col, col];
            for (var j = 0; j < 2 * n; j++)
            {
                work[col, j] /= scale;
            }
            for (var row = 0; row < n; row++)
            {
                if (row == col)
                {
                    continue;
                }
                var factor = work[row, col];
                for (var j = 0; j < 2 * n; j++)
                {
                    work[row, j] -= factor * work[col, j];
                }
            }
        }

        var inverse = new double[n, n];
        for (var i = 0; i < n; i++)
        {
            for (var j = 0; j < n; j++)
            {
                inverse[i, j] = work[i, n + j];
            }
        }
        return inverse;
    }
}
