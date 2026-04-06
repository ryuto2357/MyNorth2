import Stripe from 'stripe'

function createStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-03-25.dahlia',
  })
}

let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (!_stripe) _stripe = createStripeClient()
  return _stripe
}

export const PRICE_MAP: Record<string, { amount: number; name: string }> = {
  TIER_2: { amount: 3990, name: 'MyNorth Pro' },       // SGD 39.90
  TIER_3: { amount: 8990, name: 'MyNorth Ultimate' },   // SGD 89.90
}
