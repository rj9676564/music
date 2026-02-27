# Build stage
# Use BUILDPLATFORM to run the compiler on the native host architecture (fast)
FROM --platform=$BUILDPLATFORM golang:1.23-alpine AS builder

# TARGETOS and TARGETARCH are automatically provided by Docker Buildx
ARG TARGETOS
ARG TARGETARCH

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache ca-certificates

# Copy go mod files and download with cache mount
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .

# Build the application using cross-compilation
# This avoids running the compiler under QEMU emulation for ARM64
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o main .

# Final stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies for SQLite and safety
RUN apk add --no-cache ca-certificates libc6-compat

# Create data and media directories
RUN mkdir -p pb_data media_cache

# Copy the binary from builder
COPY --from=builder /app/main .

EXPOSE 8080

# Run the pocketbase app
CMD ["./main", "serve", "--http=0.0.0.0:8080"]
