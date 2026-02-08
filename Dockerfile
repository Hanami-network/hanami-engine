FROM rust:1.84-slim-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
        pkg-config libssl-dev build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY Cargo.toml Cargo.lock* ./
COPY rust-toolchain.toml* ./
COPY programs/hanami/Cargo.toml programs/hanami/Cargo.toml
COPY cli/Cargo.toml cli/Cargo.toml
RUN mkdir -p programs/hanami/src cli/src \
    && echo "fn main() {}" > cli/src/main.rs \
    && echo "" > programs/hanami/src/lib.rs \
    && cargo build --release -p hanami-cli || true

COPY programs programs
COPY cli cli
RUN cargo build --release -p hanami-cli

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -r -u 1001 -m hanami
COPY --from=builder /app/target/release/hanami-cli /usr/local/bin/hanami-cli
USER hanami
WORKDIR /home/hanami
ENTRYPOINT ["hanami-cli"]
