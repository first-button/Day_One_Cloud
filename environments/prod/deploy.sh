#!/bin/bash
set -euo pipefail

STACK_NAME="day-one-prod"
TEMPLATE_FILE="$(dirname "$0")/template.yaml"
REGION="us-east-1"

# Get VPC and IGW from dev stack outputs
DEV_STACK="day-one-dev"

echo "Fetching VPC and Internet Gateway from ${DEV_STACK} stack..."

VPC_ID=$(aws cloudformation describe-stacks \
  --stack-name "${DEV_STACK}" \
  --region "${REGION}" \
  --query "Stacks[0].Outputs[?OutputKey=='VPCId'].OutputValue" \
  --output text)

# Get Internet Gateway ID from VPC
IGW_ID=$(aws ec2 describe-internet-gateways \
  --filters "Name=attachment.vpc-id,Values=${VPC_ID}" \
  --region "${REGION}" \
  --query "InternetGateways[0].InternetGatewayId" \
  --output text)

echo "VPC ID: ${VPC_ID}"
echo "Internet Gateway ID: ${IGW_ID}"
echo ""
echo "Deploying stack: ${STACK_NAME}"

aws cloudformation deploy \
  --template-file "${TEMPLATE_FILE}" \
  --stack-name "${STACK_NAME}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "${REGION}" \
  --parameter-overrides \
    VPCId="${VPC_ID}" \
    InternetGatewayId="${IGW_ID}"

echo ""
echo "Stack outputs:"
aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${REGION}" \
  --query "Stacks[0].Outputs" \
  --output table
