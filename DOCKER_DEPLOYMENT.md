# Docker Deployment Guide for Snailwatch

This guide explains how to deploy Snailwatch using Docker with NGINX as a reverse proxy.

## Architecture

```
Internet → NGINX Container (Port 80/443) → Snailwatch Container (Port 3000)
```

Both containers communicate via a Docker network.

## Quick Start

### Option 1: Standalone Container

Build and run the Snailwatch container:

```bash
# Build the image
docker build -t snailwatch:latest .

# Run the container
docker run -d \
  --name snailwatch \
  -p 3000:3000 \
  --restart unless-stopped \
  snailwatch:latest
```

The app will be available at `http://localhost:3000`

### Option 2: Docker Compose (Recommended)

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Connecting with NGINX in Another Container

### Step 1: Create a Shared Docker Network

If your NGINX container is separate, create a shared network:

```bash
# Create network (if not using docker-compose)
docker network create snailwatch-network

# Run Snailwatch on the network
docker run -d \
  --name snailwatch \
  --network snailwatch-network \
  -p 3000:3000 \
  snailwatch:latest
```

### Step 2: Configure Your NGINX Container

Add your NGINX container to the same network:

```bash
docker network connect snailwatch-network <your-nginx-container-name>
```

Or if starting fresh:

```bash
docker run -d \
  --name nginx \
  --network snailwatch-network \
  -p 80:80 \
  -p 443:443 \
  -v /path/to/nginx.conf:/etc/nginx/conf.d/snailwatch.conf \
  nginx:alpine
```

### Step 3: NGINX Configuration

Use the provided `nginx.conf.example` as a template. Key points:

1. **Upstream Configuration**: Point to the container name
   ```nginx
   upstream snailwatch_backend {
       server snailwatch:3000;  # Container name from docker-compose
   }
   ```

2. **Proxy Pass**: Forward requests to the upstream
   ```nginx
   location / {
       proxy_pass http://snailwatch_backend;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   }
   ```

## Complete Docker Compose Setup (App + NGINX)

Create a `docker-compose.full.yml`:

```yaml
version: '3.8'

services:
  snailwatch:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: snailwatch-app
    restart: unless-stopped
    networks:
      - app-network
    environment:
      - NODE_ENV=production

  nginx:
    image: nginx:alpine
    container_name: snailwatch-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf.example:/etc/nginx/conf.d/default.conf:ro
      # - ./ssl:/etc/nginx/ssl:ro  # For SSL certificates
    networks:
      - app-network
    depends_on:
      - snailwatch

networks:
  app-network:
    driver: bridge
```

Run with:
```bash
docker-compose -f docker-compose.full.yml up -d
```

## Environment Variables

Currently, the app doesn't require environment variables. If you need to add any:

```yaml
services:
  snailwatch:
    environment:
      - NODE_ENV=production
      - CUSTOM_VAR=value
```

## Port Configuration

- **Container Port**: 3000 (internal)
- **Host Port**: 3000 (can be changed in docker-compose.yml)
- **NGINX Port**: 80/443 (public-facing)

To change the exposed port:
```yaml
ports:
  - "8080:3000"  # Access on host port 8080
```

## Health Checks

The container includes a health check that runs every 30 seconds:

```bash
# Check container health
docker ps
docker inspect snailwatch | grep -A 10 Health
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker logs snailwatch

# Check if port is already in use
lsof -i :3000
```

### NGINX can't reach the app
```bash
# Verify both containers are on the same network
docker network inspect snailwatch-network

# Test connection from NGINX container
docker exec <nginx-container> wget -O- http://snailwatch:3000
```

### Build fails
```bash
# Clear Docker cache and rebuild
docker builder prune
docker build --no-cache -t snailwatch:latest .
```

## Production Considerations

1. **SSL/TLS**: Use Let's Encrypt with certbot for HTTPS
2. **Firewall**: Only expose ports 80 and 443, keep 3000 internal
3. **Monitoring**: Add health check endpoints and monitoring
4. **Logging**: Configure log rotation and centralized logging
5. **Backups**: No database, but consider backing up configuration
6. **Updates**: Use CI/CD to automate image builds and deployments

## Security Best Practices

1. **Run as non-root**: The Dockerfile uses Node's default user
2. **Network isolation**: Keep app container on private network
3. **Rate limiting**: Configure in NGINX
4. **Security headers**: Already included in nginx.conf.example
5. **Keep updated**: Regularly update base images

## Useful Commands

```bash
# View logs
docker-compose logs -f snailwatch

# Restart container
docker-compose restart snailwatch

# Rebuild after code changes
docker-compose up -d --build

# Shell into container
docker exec -it snailwatch sh

# Check resource usage
docker stats snailwatch

# Remove everything
docker-compose down -v
docker rmi snailwatch:latest
```

## Performance Tuning

For high traffic, consider:

1. **Multiple replicas**: Use Docker Swarm or Kubernetes
2. **Load balancing**: Configure NGINX upstream with multiple backends
3. **Caching**: Add Redis for API response caching
4. **CDN**: Serve static assets via CDN

## Support

For issues, check:
- Container logs: `docker logs snailwatch`
- NGINX logs: `docker logs <nginx-container>`
- Network connectivity: `docker network inspect snailwatch-network`
