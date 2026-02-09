# Feature: Response Time Optimization for Relay/Axion

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

Optimize the Relay/Axion chat interface response times by implementing streaming responses, caching, and connection pooling to reduce the current 3-4 second response time to under 500ms for initial responses and near real-time streaming for ongoing AI responses.

## User Story

As a user of the Axion chat interface
I want to see AI responses start appearing within 500ms and stream in real-time
So that the conversation feels natural and responsive instead of having 3-4 second delays

## Problem Statement

The current Relay/Axion system suffers from multiple performance bottlenecks causing 3-4 second response times:
- File-based job queue with 0.5-2 second polling cycles
- Synchronous HTTP server with no connection pooling
- SSE implementation that polls filesystem instead of true push-based events
- No response caching for repeated queries
- Multiple layers of polling (queue → PTY → SSE → frontend) each adding 0.5-3 second delays

## Solution Statement

Replace the polling-based architecture with event-driven streaming using:
1. **Redis-based job queue** with pub/sub for real-time job status updates
2. **FastAPI async architecture** with proper SSE streaming and connection pooling
3. **Multi-level caching strategy** for API responses and static content
4. **True push-based SSE** eliminating filesystem polling
5. **Async file I/O** and optimized watcher process

## Feature Metadata

**Feature Type**: Performance Enhancement
**Estimated Complexity**: High
**Primary Systems Affected**: Server, API handlers, Watcher process, Frontend JavaScript
**Dependencies**: Redis, FastAPI, uvicorn, aiofiles, sse-starlette

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `relay/server.py` (lines 322-391) - Why: Contains current SSE implementation with filesystem polling to replace
- `relay/api_handlers.py` (lines 483-655) - Why: handle_chat_status function processes job statuses, needs async conversion
- `watcher.py` (lines 377-451, 928-998) - Why: Stream parsing and PTY reading loops need Redis integration
- `relay/templates/app.js` (lines 2483-2595) - Why: Frontend polling logic needs updating for faster SSE
- `relay/config.py` - Why: Contains POLLING_CONFIG timing that needs adjustment
- `requirements.txt` - Why: Need to add Redis, FastAPI dependencies

### New Files to Create

- `relay/async_server.py` - FastAPI server with async handlers
- `relay/redis_queue.py` - Redis-based job queue manager
- `relay/cache_manager.py` - Multi-level caching system
- `relay/streaming_handlers.py` - Async SSE and streaming endpoints
- `tests/test_streaming_performance.py` - Performance tests for streaming
- `docker-compose.yml` - Redis service for development

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [FastAPI Async Guide](https://fastapi.tiangolo.com/async/)
  - Specific section: async/await patterns for streaming
  - Why: Required for implementing non-blocking streaming responses
- [sse-starlette Documentation](https://github.com/sysid/sse-starlette#readme)
  - Specific section: EventSourceResponse implementation
  - Why: Proper SSE streaming without filesystem polling
- [Redis Streams Guide](https://redis.io/docs/data-types/streams/)
  - Specific section: Consumer groups and XREAD
  - Why: Real-time job queue with pub/sub capabilities
- [ARQ Documentation](https://github.com/python-arq/arq#readme)
  - Specific section: Job queuing and Redis integration
  - Why: Async job processing to replace file-based queue

### Patterns to Follow

**Async Handler Pattern** (to replace sync handlers):
```python
# Current pattern in api_handlers.py
def handle_chat_status(job_id):
    # Synchronous file reading
    with open(f"{job_id}.json") as f:
        return json.load(f)

# New async pattern
async def handle_chat_status_async(job_id: str):
    import aiofiles
    async with aiofiles.open(f"{job_id}.json") as f:
        content = await f.read()
        return json.loads(content)
```

**SSE Streaming Pattern** (to replace polling):
```python
# Current: filesystem polling every 0.5s
# New: Redis pub/sub instant updates
async def stream_job_status(job_id: str):
    async def event_generator():
        subscriber = await redis_client.subscribe(f"job:{job_id}")
        async for message in subscriber:
            yield {"data": json.dumps(message)}
    return EventSourceResponse(event_generator())
```

**Error Handling Pattern** (from existing codebase):
```python
# Follow existing pattern in api_handlers.py around line 500
try:
    # operation
    return {"status": "success", "data": result}
except Exception as e:
    logger.error(f"Error in operation: {e}")
    return {"status": "error", "message": str(e)}
```

**Logging Pattern** (from existing watcher.py):
```python
import logging
logger = logging.getLogger(__name__)
logger.info(f"Processing job {job_id}")
```

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation Setup

Establish Redis infrastructure and async dependencies without disrupting current system.

**Tasks:**
- Install Redis server and Python async dependencies
- Create Redis connection manager and health checks
- Set up async development environment
- Create parallel async endpoints for testing

### Phase 2: Job Queue Migration

Replace file-based job queue with Redis while maintaining compatibility.

**Tasks:**
- Implement Redis-based job queue alongside existing file system
- Create pub/sub channels for job status updates
- Migrate watcher process to publish to Redis
- Add fallback to file system for reliability

### Phase 3: FastAPI Migration

Replace ThreadingHTTPServer with FastAPI async architecture.

**Tasks:**
- Create FastAPI application with async endpoints
- Implement proper SSE streaming with Redis pub/sub
- Add connection pooling for external API calls
- Migrate existing endpoints to async handlers

### Phase 4: Caching Implementation

Add multi-level caching for improved response times.

**Tasks:**
- Implement Redis-based response caching
- Add memory cache for hot data
- Create semantic caching for AI responses
- Optimize static asset caching

### Phase 5: Frontend Optimization

Update frontend to work with faster streaming and reduced polling.

**Tasks:**
- Reduce frontend polling intervals
- Add proper SSE error handling and reconnection
- Optimize JavaScript for faster rendering
- Add performance monitoring

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### CREATE docker-compose.yml

- **IMPLEMENT**: Redis service configuration for development environment
- **PATTERN**: Standard Redis Docker setup with persistence
- **IMPORTS**: No imports needed (YAML configuration)
- **GOTCHA**: Ensure Redis port 6379 is available and not conflicting
- **VALIDATE**: `docker-compose up -d redis && docker-compose ps`

### UPDATE requirements.txt

- **IMPLEMENT**: Add FastAPI, Redis, and async dependencies
- **PATTERN**: Follow existing dependency format with version pinning
- **IMPORTS**: Add fastapi>=0.104.0, uvicorn>=0.24.0, redis>=5.0.0, aiofiles>=23.0.0, sse-starlette>=1.8.0
- **GOTCHA**: Pin versions to avoid compatibility issues
- **VALIDATE**: `pip install -r requirements.txt`

### CREATE relay/redis_queue.py

- **IMPLEMENT**: Redis-based job queue manager with pub/sub
- **PATTERN**: Mirror existing file-based queue interface in watcher.py:717-738
- **IMPORTS**: import redis.asyncio as redis, import json, import asyncio
- **GOTCHA**: Handle Redis connection failures gracefully with file fallback
- **VALIDATE**: `python -c "from relay.redis_queue import RedisQueue; print('OK')"`

### CREATE relay/cache_manager.py

- **IMPLEMENT**: Multi-level caching with Redis and memory cache
- **PATTERN**: Cache-aside pattern with TTL expiration
- **IMPORTS**: import redis.asyncio as redis, import json, import hashlib, import time
- **GOTCHA**: Implement proper cache invalidation and size limits
- **VALIDATE**: `python -c "from relay.cache_manager import CacheManager; print('OK')"`

### CREATE relay/streaming_handlers.py

- **IMPLEMENT**: Async SSE handlers for job status streaming
- **PATTERN**: Mirror existing SSE pattern from server.py:322-391 but async
- **IMPORTS**: from fastapi.responses import StreamingResponse, from sse_starlette import EventSourceResponse
- **GOTCHA**: Handle client disconnections and cleanup subscriptions
- **VALIDATE**: `python -c "from relay.streaming_handlers import stream_job_status; print('OK')"`

### CREATE relay/async_server.py

- **IMPLEMENT**: FastAPI application with all async endpoints
- **PATTERN**: Convert existing endpoints from api_handlers.py to FastAPI async
- **IMPORTS**: from fastapi import FastAPI, Request, from fastapi.staticfiles import StaticFiles
- **GOTCHA**: Maintain exact API compatibility with existing endpoints
- **VALIDATE**: `uvicorn relay.async_server:app --reload --port 8001`

### UPDATE watcher.py

- **IMPLEMENT**: Redis pub/sub integration in PTY reading loop
- **PATTERN**: Add Redis publishing alongside existing file writes at lines 928-998
- **IMPORTS**: from relay.redis_queue import RedisQueue
- **GOTCHA**: Maintain file-based fallback if Redis is unavailable
- **VALIDATE**: `python watcher.py --test-mode`

### UPDATE relay/api_handlers.py

- **IMPLEMENT**: Convert handle_chat_status to async with Redis caching
- **PATTERN**: Add async version alongside sync version for gradual migration
- **IMPORTS**: from relay.cache_manager import CacheManager, import aiofiles
- **GOTCHA**: Keep sync version functional during transition
- **VALIDATE**: `python -c "import relay.api_handlers; print('OK')"`

### UPDATE relay/templates/app.js

- **IMPLEMENT**: Reduce polling intervals and add SSE reconnection logic
- **PATTERN**: Update startPolling function at lines 2483-2595
- **IMPORTS**: No imports (JavaScript file)
- **GOTCHA**: Maintain backwards compatibility with existing SSE endpoint
- **VALIDATE**: Load frontend and verify faster updates in browser dev tools

### CREATE tests/test_streaming_performance.py

- **IMPLEMENT**: Performance tests to validate <500ms response times
- **PATTERN**: Follow existing test structure in project
- **IMPORTS**: import pytest, import asyncio, import time
- **GOTCHA**: Use realistic test data and concurrent connections
- **VALIDATE**: `pytest tests/test_streaming_performance.py -v`

### UPDATE relay/config.py

- **IMPLEMENT**: Add Redis configuration and reduce polling intervals
- **PATTERN**: Follow existing POLLING_CONFIG pattern
- **IMPORTS**: import os
- **GOTCHA**: Provide sensible defaults if Redis is not configured
- **VALIDATE**: `python -c "from relay.config import REDIS_CONFIG; print('OK')"`

### CREATE relay/async_main.py

- **IMPLEMENT**: Async application entry point with proper startup/shutdown
- **PATTERN**: Mirror relay.py structure but for async FastAPI
- **IMPORTS**: import uvicorn, from relay.async_server import app
- **GOTCHA**: Ensure graceful shutdown of Redis connections
- **VALIDATE**: `python relay/async_main.py --port 8001`

---

## TESTING STRATEGY

### Unit Tests

Design async unit tests using pytest-asyncio for all streaming components:
- Redis queue operations (enqueue, dequeue, pub/sub)
- Cache manager functionality (get, set, invalidate)
- SSE stream generation and client disconnection handling
- Async API endpoint responses

### Integration Tests

Test full request/response cycle with Redis and FastAPI:
- End-to-end job submission and status streaming
- SSE connection lifecycle with multiple clients
- Cache hit/miss scenarios with realistic data
- Error handling and fallback mechanisms

### Performance Tests

Measure response time improvements:
- Initial response time (<500ms target)
- Streaming chunk delivery rate (<100ms between chunks)
- Concurrent connection handling (100+ simultaneous SSE streams)
- Memory usage under load
- Redis throughput and latency

### Edge Cases

Test failure scenarios and edge cases:
- Redis server unavailability (fallback to file system)
- Client disconnection during streaming
- Large response payload handling
- Network connectivity issues
- Race conditions in pub/sub messaging

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Syntax & Style

```bash
# Python syntax and import validation
python -m py_compile relay/redis_queue.py
python -m py_compile relay/async_server.py
python -m py_compile relay/cache_manager.py
python -m py_compile relay/streaming_handlers.py

# Check for obvious errors
python -c "import relay.redis_queue; print('Redis queue OK')"
python -c "import relay.async_server; print('Async server OK')"
```

### Level 2: Unit Tests

```bash
# Run new performance tests
pytest tests/test_streaming_performance.py -v

# Verify existing functionality still works
python -m pytest tests/ -k "not test_streaming" -v
```

### Level 3: Integration Tests

```bash
# Start Redis for testing
docker-compose up -d redis

# Test async server startup
timeout 10s uvicorn relay.async_server:app --port 8001 --reload &
sleep 3
curl http://localhost:8001/health
pkill -f uvicorn

# Test SSE endpoint
timeout 10s uvicorn relay.async_server:app --port 8001 &
curl -N http://localhost:8001/api/sse/status/test-job-id &
sleep 5
pkill -f uvicorn
```

### Level 4: Manual Validation

**Response Time Testing:**
```bash
# Measure response time improvement
time curl -s http://localhost:8000/api/chat/status/test-job
# Target: <500ms for initial response

# Test SSE streaming
curl -N http://localhost:8000/api/sse/status/test-job
# Target: <100ms between chunks
```

**Frontend Testing:**
1. Open browser developer tools
2. Start a new chat session
3. Verify SSE connections in Network tab
4. Measure time to first content (<500ms)
5. Verify streaming chunks appear without polling delays

### Level 5: Performance Validation

```bash
# Redis performance check
redis-cli --latency-dist -i 1

# Concurrent connection test
for i in {1..10}; do
    curl -N http://localhost:8000/api/sse/status/job-$i &
done
sleep 10
pkill curl

# Memory usage monitoring
ps aux | grep python | grep relay
```

---

## ACCEPTANCE CRITERIA

- [ ] Initial API response time reduced from 3-4 seconds to <500ms
- [ ] SSE streaming delivers chunks with <100ms latency
- [ ] All existing functionality preserved during migration
- [ ] Redis integration working with graceful fallback to file system
- [ ] Frontend updates display streaming responses without polling delays
- [ ] Performance tests pass showing measurable improvement
- [ ] 100+ concurrent SSE connections handled without degradation
- [ ] Multi-level caching reduces repeat query response time to <50ms
- [ ] Error handling maintains system stability under load
- [ ] Memory usage remains stable during extended operation

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in dependency order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes (unit + integration + performance)
- [ ] No syntax or import errors
- [ ] Response time targets achieved (<500ms initial, <100ms streaming)
- [ ] Manual testing confirms improved user experience
- [ ] Acceptance criteria all met
- [ ] Code follows existing project patterns and conventions
- [ ] Documentation updated for new async architecture

---

## NOTES

**Design Decisions:**
- **Gradual Migration**: Keep existing sync system operational during async migration to minimize risk
- **Redis-First with Fallback**: Use Redis for performance but maintain file-based fallback for reliability
- **Backwards Compatibility**: New FastAPI endpoints mirror existing API structure exactly
- **Performance Targets**: <500ms initial response and <100ms streaming chunks based on modern web standards

**Trade-offs:**
- **Complexity vs Performance**: Adding Redis dependency increases operational complexity but provides significant performance gains
- **Memory vs Speed**: Multi-level caching uses more memory but dramatically improves response times
- **Migration Risk**: Parallel systems during transition require more testing but enable safer rollback

**Future Enhancements:**
- WebSocket support for bidirectional real-time features
- Horizontal scaling with Redis Cluster
- Advanced semantic caching with vector embeddings
- Connection pooling optimization for external APIs