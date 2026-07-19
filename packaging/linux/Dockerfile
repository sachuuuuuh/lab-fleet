FROM node:22.23.0-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends binutils dpkg fakeroot xz-utils \
    && rm -rf /var/lib/apt/lists/*

ENV ELECTRON_CACHE=/root/.cache/electron \
    ELECTRON_BUILDER_CACHE=/root/.cache/electron-builder

WORKDIR /workspace
