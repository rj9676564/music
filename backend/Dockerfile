# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Install build dependencies (No longer need gcc for pure-Go SQLite)
RUN apk add --no-cache ca-certificates

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build the application
# We use CGO_ENABLED=0 for faster, statically linked, and cross-platform builds
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# Final stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies for SQLite and safety
RUN apk add --no-cache ca-certificates libc6-compat

# Create data and media directories
RUN mkdir -p data media_cache

# Copy the binary from builder
COPY --from=builder /app/main .

EXPOSE 8080

CMD ["./main"]
