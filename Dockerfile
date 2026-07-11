FROM oven/bun:1 AS web
WORKDIR /client
COPY client/package.json client/bun.lock ./
RUN bun install --frozen-lockfile
COPY client/ ./
RUN bun run build            # -> /client/dist

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /build
COPY src/RoyaleDeckLab.Api/RoyaleDeckLab.Api.csproj src/RoyaleDeckLab.Api/
RUN dotnet restore src/RoyaleDeckLab.Api/RoyaleDeckLab.Api.csproj
COPY src/RoyaleDeckLab.Api/ src/RoyaleDeckLab.Api/
RUN dotnet publish src/RoyaleDeckLab.Api/RoyaleDeckLab.Api.csproj \
        -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

COPY --from=api /app/publish ./
COPY --from=web /client/dist ./wwwroot

RUN mkdir -p /data && chown $APP_UID /data
ENV Meta__DbPath=/data/meta.db
VOLUME /data

ENV ASPNETCORE_URLS=http://0.0.0.0:3000
EXPOSE 3000

USER $APP_UID

ENTRYPOINT ["dotnet", "RoyaleDeckLab.Api.dll"]
