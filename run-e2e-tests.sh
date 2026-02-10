#!/bin/bash
#
# E2E Test Runner for ClaimsAI and HubAI
# Usage: ./run-e2e-tests.sh [claimsai|hubai|all]
#

SCREENSHOT_DIR="/opt/clawd/projects/relay/.screenshots"
CLAIMSAI_DIR="/opt/clawd/projects/ClaimsAI"
HUBAI_DIR="/opt/clawd/projects/HUBAi"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}     E2E Test Runner                   ${NC}"
echo -e "${BLUE}========================================${NC}"

# Ensure screenshot directory exists
mkdir -p "$SCREENSHOT_DIR"

run_claimsai_tests() {
    echo -e "\n${BLUE}Running ClaimsAI E2E Tests...${NC}"
    cd "$CLAIMSAI_DIR"

    # Check if server is running
    if ! curl -s http://127.0.0.1:5173 > /dev/null 2>&1; then
        echo -e "${RED}Warning: ClaimsAI frontend (port 5173) not responding${NC}"
        echo "Start with: cd $CLAIMSAI_DIR/loveable && npm run dev"
    fi

    # Run tests
    npx playwright test e2e-full-suite.spec.ts --reporter=list

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}ClaimsAI tests PASSED${NC}"
    else
        echo -e "${RED}ClaimsAI tests FAILED${NC}"
    fi

    # Show report location
    echo -e "\nReport: ${SCREENSHOT_DIR}/claimsai_e2e_report.html"
    echo -e "Screenshots: ${SCREENSHOT_DIR}/claimsai_e2e_*.png"
}

run_hubai_tests() {
    echo -e "\n${BLUE}Running HubAI E2E Tests...${NC}"
    cd "$HUBAI_DIR"

    # Check if server is running
    if ! curl -s http://127.0.0.1:5173 > /dev/null 2>&1; then
        echo -e "${RED}Warning: HubAI frontend (port 5173) not responding${NC}"
        echo "Start with: cd $HUBAI_DIR/loveable && npm run dev"
    fi

    # Run tests
    npx playwright test e2e-full-suite.spec.ts --reporter=list

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}HubAI tests PASSED${NC}"
    else
        echo -e "${RED}HubAI tests FAILED${NC}"
    fi

    # Show report location
    echo -e "\nReport: ${SCREENSHOT_DIR}/hubai_e2e_report.html"
    echo -e "Screenshots: ${SCREENSHOT_DIR}/hubai_e2e_*.png"
}

# Parse arguments
case "${1:-all}" in
    claimsai)
        run_claimsai_tests
        ;;
    hubai)
        run_hubai_tests
        ;;
    all)
        run_claimsai_tests
        echo ""
        run_hubai_tests
        ;;
    *)
        echo "Usage: $0 [claimsai|hubai|all]"
        echo ""
        echo "  claimsai  - Run ClaimsAI E2E tests only"
        echo "  hubai     - Run HubAI E2E tests only"
        echo "  all       - Run all E2E tests (default)"
        exit 1
        ;;
esac

echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}     Test Run Complete                 ${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "\nView reports in relay at: http://localhost:5001"
echo -e "Click the 📸 Screenshots button in Axion panel"
