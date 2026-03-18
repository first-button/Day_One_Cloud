#!/bin/bash
set -euo pipefail

STACK_NAME="day-one-prod"
TEMPLATE_FILE="$(dirname "$0")/template.yaml"
REGION="us-east-1"
DEV_STACK="day-one-dev"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

echo "=== Day One Prod Deployment ==="
echo ""

# Step 1: Get VPC and IGW from dev stack
echo "[1/4] Fetching VPC and IGW from ${DEV_STACK}..."

VPC_ID=$(aws cloudformation describe-stacks \
  --stack-name "${DEV_STACK}" \
  --region "${REGION}" \
  --query "Stacks[0].Outputs[?OutputKey=='VPCId'].OutputValue" \
  --output text)

IGW_ID=$(aws ec2 describe-internet-gateways \
  --filters "Name=attachment.vpc-id,Values=${VPC_ID}" \
  --region "${REGION}" \
  --query "InternetGateways[0].InternetGatewayId" \
  --output text)

echo "  VPC: ${VPC_ID}"
echo "  IGW: ${IGW_ID}"

# Step 2: Deploy CloudFormation stack
echo ""
echo "[2/4] Deploying CloudFormation stack: ${STACK_NAME}..."

aws cloudformation deploy \
  --template-file "${TEMPLATE_FILE}" \
  --stack-name "${STACK_NAME}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "${REGION}" \
  --parameter-overrides \
    VPCId="${VPC_ID}" \
    InternetGatewayId="${IGW_ID}"

# Step 3: Build and push Docker images
echo ""
echo "[3/4] Building and pushing Docker images..."

aws ecr get-login-password --region "${REGION}" | \
  docker login --username AWS --password-stdin "${ECR_REGISTRY}"

echo "  Building mysql (with init.sql)..."
docker build -t day-one-prod/mysql:latest \
  -f "${REPO_ROOT}/Day_One/Dockerfile.mysql" \
  "${REPO_ROOT}/Day_One"
docker tag day-one-prod/mysql:latest "${ECR_REGISTRY}/day-one-prod/mysql:latest"
docker push "${ECR_REGISTRY}/day-one-prod/mysql:latest"

echo "  Building backend..."
docker build -t day-one-prod/backend:latest \
  -f "${REPO_ROOT}/Day_One/Dockerfile.backend" \
  "${REPO_ROOT}/Day_One"
docker tag day-one-prod/backend:latest "${ECR_REGISTRY}/day-one-prod/backend:latest"
docker push "${ECR_REGISTRY}/day-one-prod/backend:latest"

echo "  Building frontend (prod nginx config)..."
docker build -t day-one-prod/frontend:latest \
  --build-arg NGINX_CONF=nginx.prod.conf \
  -f "${REPO_ROOT}/Day_One/Dockerfile.frontend" \
  "${REPO_ROOT}/Day_One"
docker tag day-one-prod/frontend:latest "${ECR_REGISTRY}/day-one-prod/frontend:latest"
docker push "${ECR_REGISTRY}/day-one-prod/frontend:latest"

# Step 4: Force ECS redeployment
echo ""
echo "[4/4] Forcing ECS redeployment..."

aws ecs update-service \
  --cluster day-one-prod \
  --service app \
  --force-new-deployment \
  --region "${REGION}" \
  --no-cli-pager > /dev/null

echo ""
echo "=== Deployment Complete ==="
echo ""

aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${REGION}" \
  --query "Stacks[0].Outputs" \
  --output table

echo ""
echo "IMPORTANT: Update secrets in Secrets Manager if not done yet:"
echo "  aws secretsmanager put-secret-value --secret-id first_button_prod --secret-string '{...}'"
