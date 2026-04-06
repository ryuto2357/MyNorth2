import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-api'
import { getStripe, PRICE_MAP } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tier } = await request.json()
    const userId = authUser.id

    if (!tier || !PRICE_MAP[tier]) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: user } = await supabase.from('users').select('email').eq('id', userId).single()
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Find or create Stripe customer
    const { data: sub } = await supabase.from('subscriptions').select('stripe_customer_id').eq('user_id', userId).single()
    let customerId = sub?.stripe_customer_id

    if (!customerId) {
      const customer = await getStripe().customers.create({ email: user.email, metadata: { userId } })
      customerId = customer.id
    }

    const price = PRICE_MAP[tier]

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'sgd',
          product_data: { name: price.name },
          unit_amount: price.amount,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/subscription?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/subscription?cancelled=true`,
      metadata: { userId, tier },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Checkout creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
