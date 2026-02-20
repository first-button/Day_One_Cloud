#!/bin/bash
set -euo pipefail

STACK_NAME="day-one-dev"
TEMPLATE_FILE="$(dirname "$0")/template.yaml"
REGION="us-east-1"

echo "Deploying stack: ${STACK_NAME}"

aws cloudformation deploy \
  --template-file "${TEMPLATE_FILE}" \
  --stack-name "${STACK_NAME}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "${REGION}"

echo ""
echo "Stack outputs:"
aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${REGION}" \
  --query "Stacks[0].Outputs" \
  --output table
