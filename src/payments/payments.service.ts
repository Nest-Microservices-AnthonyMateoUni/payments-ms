import { Inject, Injectable, Logger } from '@nestjs/common';
import { envs, NATS_SERVICE } from 'src/config';
import Stripe from 'stripe';
import { ClientProxy } from '@nestjs/microservices';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { Request, Response } from 'express';

@Injectable()
export class PaymentsService {
  private readonly stripe = new Stripe(envs.stripeSecret);
  private readonly logger = new Logger('PaymentsService');

  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {}

  async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
    const { currency, items, orderId } = paymentSessionDto;

    const lineItems = items.map((item) => {
      return {
        price_data: {
          currency: currency,
          product_data: {
            name: item.name,
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      };
    });

    const session = await this.stripe.checkout.sessions.create({
      // Colocalr aquí el ID de mi orden
      payment_intent_data: {
        metadata: {
          orderId: orderId,
        },
      },
      line_items: lineItems,
      mode: 'payment',
      success_url: envs.sripeSuccessUrl,
      cancel_url: envs.stripeCancelUrl,
    });
    return {
      cancelUrl: session.cancel_url,
      successUrl: session.success_url,
      url: session.url,
    };
  }

  // async stripeWebhook(req: Request, res: Response) {
  //   const sig = req.headers['stripe-signature'];
  //   console.log({ sig });

  //   return res.status(200).json({ sig });
  // }
  async stripeWebhook(req: Request, res: Response) {
    const sig = req.headers['stripe-signature'];

    // Ensure sig is not undefined
    if (!sig) {
      return res.status(400).send('Missing Stripe signature.');
    }

    let event: Stripe.Event;
    const endpointSecret = envs.stripeEndpointSecret;

    try {
      event = this.stripe.webhooks.constructEvent(
        req['rawBody'],
        sig,
        endpointSecret,
      );
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }
    //
    switch (event.type) {
      case 'charge.succeeded':
        const chargerSucceeded = event.data.object;
        const payload = {
          stripePaymentId: chargerSucceeded.id,
          orderId: chargerSucceeded.metadata.orderId,
          receiptUrl: chargerSucceeded.receipt_url,
        };
        // console.log(event);

        // console.log({
        //   metadata: chargerSucceeded.metadata,
        //   ordederId: chargerSucceeded.metadata.orderId,
        // });

        // this.logger.log({ payload });
        this.client.emit('payment.succeeded', payload);
        break;
      default:
        console.log(`Event ${event.type} not handled`);
    }

    return res.status(200).json({ sig });
  }
}
