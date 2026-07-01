# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the React SPA (Vite) with Bun.
# ---------------------------------------------------------------------------
FROM oven/bun:1 AS web
WORKDIR /web
# Install deps first (cached until the lockfile/manifest change).
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build            # -> /web/dist

# ---------------------------------------------------------------------------
# Stage 2 — publish the ASP.NET API (.NET 10).
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
# Restore against just the csproj first so the layer caches across code edits.
COPY server/RoyaleDeckLab.Api/RoyaleDeckLab.Api.csproj server/RoyaleDeckLab.Api/
RUN dotnet restore server/RoyaleDeckLab.Api/RoyaleDeckLab.Api.csproj
COPY server/RoyaleDeckLab.Api/ server/RoyaleDeckLab.Api/
RUN dotnet publish server/RoyaleDeckLab.Api/RoyaleDeckLab.Api.csproj \
        -c Release -o /app/publish

# ---------------------------------------------------------------------------
# Stage 3 — runtime: ASP.NET shared framework only, no SDK.
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# The published API...
COPY --from=api /app/publish ./
# ...plus the built SPA served from wwwroot (same origin, so /api calls just work).
COPY --from=web /web/dist ./wwwroot

# Derived, regenerable battle store lives on a volume so it survives restarts.
# Starts empty on a fresh volume and is rebuilt from the CR API by the background job.
RUN mkdir -p /data
ENV Meta__DbPath=/data/meta.db
VOLUME /data

# Bind all interfaces inside the container; Program.cs honours ASPNETCORE_URLS.
ENV ASPNETCORE_URLS=http://0.0.0.0:3000
EXPOSE 3000

# CLASH_ROYALE_API_KEY must be supplied at run time (-e / secret), never baked in.
ENTRYPOINT ["dotnet", "RoyaleDeckLab.Api.dll"]
