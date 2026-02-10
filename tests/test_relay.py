#!/usr/bin/env python3
"""API tests for the relay server."""

import requests
import time
import json
import sys

BASE_URL = "http://localhost:7786"


def test_health():
    """Test health endpoint."""
    r = requests.get(f"{BASE_URL}/api/health")
    assert r.status_code == 200, f"Health check failed: {r.status_code}"
    data = r.json()
    assert "healthy" in data or "status" in data
    print(f"  Health status: {data.get('healthy', data.get('status'))}")


def test_projects():
    """Test projects list endpoint."""
    r = requests.get(f"{BASE_URL}/api/projects")
    assert r.status_code == 200, f"Projects list failed: {r.status_code}"
    data = r.json()
    assert "projects" in data
    assert isinstance(data["projects"], list)
    print(f"  Found {len(data['projects'])} projects")


def test_page_load():
    """Test main page loads."""
    r = requests.get(BASE_URL)
    assert r.status_code == 200, f"Page load failed: {r.status_code}"
    assert "Chat Relay" in r.text, "Page content missing title"
    assert len(r.text) > 1000, "Page content too short"
    print(f"  Page size: {len(r.text)} bytes")


def test_page_cache():
    """Test ETag caching for main page."""
    r1 = requests.get(BASE_URL)
    etag = r1.headers.get("ETag")

    if etag is None:
        print("  WARNING: No ETag header (caching may not be enabled)")
        return

    # Request with If-None-Match should return 304
    r2 = requests.get(BASE_URL, headers={"If-None-Match": etag})
    assert r2.status_code == 304, f"Expected 304, got {r2.status_code}"
    print(f"  ETag caching works (304 returned)")


def test_screenshots():
    """Test screenshots list endpoint."""
    r = requests.get(f"{BASE_URL}/api/screenshots")
    assert r.status_code == 200, f"Screenshots list failed: {r.status_code}"
    data = r.json()
    assert "screenshots" in data
    print(f"  Found {len(data['screenshots'])} screenshots")


def test_queue_status():
    """Test queue status endpoint."""
    r = requests.get(f"{BASE_URL}/api/queue/status")
    assert r.status_code == 200, f"Queue status failed: {r.status_code}"
    data = r.json()
    assert "pending" in data
    assert "processing" in data
    print(f"  Queue: {data['total']} total ({len(data['pending'])} pending, {len(data['processing'])} processing)")


def test_history_get():
    """Test history get endpoint."""
    r = requests.get(f"{BASE_URL}/api/history/relay")
    assert r.status_code == 200, f"History get failed: {r.status_code}"
    data = r.json()
    assert "history" in data
    print(f"  History: {len(data['history'])} entries for 'relay'")


def test_send_message():
    """Test sending a message (dry run - doesn't actually process)."""
    r = requests.post(f"{BASE_URL}/api/chat/start", json={
        "message": "Hello, test message (will be cancelled)",
        "project": "relay",
        "model": "opus"
    })
    assert r.status_code == 200, f"Send message failed: {r.status_code}"
    data = r.json()
    assert "job_id" in data, "No job_id in response"
    job_id = data["job_id"]
    print(f"  Created job: {job_id}")

    # Cancel it immediately
    r = requests.post(f"{BASE_URL}/api/chat/cancel", json={"job_id": job_id})
    assert r.status_code == 200, f"Cancel failed: {r.status_code}"
    print(f"  Cancelled job: {job_id}")


def test_task_load():
    """Test loading TASK.md and OUTPUT.md."""
    r = requests.post(f"{BASE_URL}/api/task/load", json={"project": "relay"})
    assert r.status_code == 200, f"Task load failed: {r.status_code}"
    data = r.json()
    assert "success" in data
    print(f"  Task exists: {'Yes' if data.get('task') else 'No'}, Output exists: {'Yes' if data.get('output') else 'No'}")


def test_axion_messages():
    """Test Axion messages endpoint."""
    r = requests.post(f"{BASE_URL}/api/axion/messages", json={"last_id": ""})
    assert r.status_code == 200, f"Axion messages failed: {r.status_code}"
    data = r.json()
    assert "messages" in data
    print(f"  Axion outbox: {len(data['messages'])} messages")


def test_syntax_highlighting():
    """Test that highlight.js is included in the page."""
    r = requests.get(BASE_URL)
    assert r.status_code == 200
    assert "highlight.js" in r.text or "hljs" in r.text, "Should include highlight.js"
    print("  Syntax highlighting library included")


def test_cache_headers():
    """Test Cache-Control headers on API endpoints."""
    # Health should have no-cache
    r = requests.get(f"{BASE_URL}/api/health")
    cache = r.headers.get("Cache-Control", "")
    assert "no-cache" in cache, f"Health should be no-cache, got: {cache}"
    print("  Health endpoint: no-cache")

    # Screenshots images should have caching
    r = requests.get(f"{BASE_URL}/api/screenshots")
    data = r.json()
    if data.get("screenshots"):
        img_url = data["screenshots"][0]["url"]
        r2 = requests.get(f"{BASE_URL}{img_url}")
        if r2.status_code == 200:
            cache2 = r2.headers.get("Cache-Control", "")
            assert "max-age" in cache2, f"Images should be cached, got: {cache2}"
            print(f"  Screenshot images: cached ({cache2})")
    else:
        print("  No screenshots to test caching")


def test_keyboard_shortcuts_in_html():
    """Test that keyboard shortcuts are documented in HTML."""
    r = requests.get(BASE_URL)
    assert r.status_code == 200
    # Check for keyboard shortcut code
    assert "Ctrl" in r.text and "Enter" in r.text, "Should document Ctrl+Enter shortcut"
    print("  Keyboard shortcuts documented in HTML")


def test_mobile_responsive():
    """Test that mobile responsive CSS is included."""
    r = requests.get(BASE_URL)
    assert r.status_code == 200
    assert "@media" in r.text, "Should include media queries for responsive design"
    assert "768px" in r.text or "max-width" in r.text, "Should have mobile breakpoints"
    print("  Mobile responsive CSS included")


def run_tests():
    """Run all tests."""
    tests = [
        ("Health Check", test_health),
        ("Projects List", test_projects),
        ("Page Load", test_page_load),
        ("Page Cache (ETag)", test_page_cache),
        ("Screenshots List", test_screenshots),
        ("Queue Status", test_queue_status),
        ("History Get", test_history_get),
        ("Send Message", test_send_message),
        ("Task Load", test_task_load),
        ("Axion Messages", test_axion_messages),
        ("Syntax Highlighting", test_syntax_highlighting),
        ("Cache Headers", test_cache_headers),
        ("Keyboard Shortcuts", test_keyboard_shortcuts_in_html),
        ("Mobile Responsive", test_mobile_responsive),
    ]

    print(f"\nRelay API Tests ({BASE_URL})")
    print("=" * 50)

    passed = 0
    failed = 0

    for name, test_func in tests:
        try:
            print(f"\n[TEST] {name}")
            test_func()
            print(f"  ✓ PASSED")
            passed += 1
        except AssertionError as e:
            print(f"  ✗ FAILED: {e}")
            failed += 1
        except requests.exceptions.ConnectionError:
            print(f"  ✗ FAILED: Connection refused (is server running?)")
            failed += 1
        except Exception as e:
            print(f"  ✗ FAILED: {type(e).__name__}: {e}")
            failed += 1

    print("\n" + "=" * 50)
    print(f"Results: {passed} passed, {failed} failed")

    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
