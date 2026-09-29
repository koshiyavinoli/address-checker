/**
 * Base URL of the address API (API Gateway → Lambda).
 * ---------------------------------------------------------------------------
 * "/api" is served by the local dev server (node backend/dev-server.mjs).
 * On AWS Amplify, amplify.yml overwrites this file at build time with the
 * value of the API_BASE_URL environment variable (the SAM stack's ApiUrl).
 */
export const API_BASE = "/api";
