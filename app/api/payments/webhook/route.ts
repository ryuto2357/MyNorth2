import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getStripe } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (error) {
    console.error('Stripe webhook verification failed:', error)
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: 400 })
  }

  const supabase = createServerClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as any
      const userId = session.metadata?.userId
      const tier = session.metadata?.tier
      if (!userId || !tier) break

      // Update user tier
      await supabase.from('users').update({ tier }).eq('id', userId)

      // Upsert subscription
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        tier,
        status: 'ACTIVE',
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        current_period_start: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as any
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_subscription_id', subscription.id)
        .single()

      if (sub) {
        await supabase.from('users').update({ tier: 'TIER_1' }).eq('id', sub.user_id)
        await supabase.from('subscriptions').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).eq('user_id', sub.user_id)
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as any
      if (invoice.subscription) {
        await supabase
          .from('subscriptions')
          .update({ status: 'PAST_DUE', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', invoice.subscription)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
