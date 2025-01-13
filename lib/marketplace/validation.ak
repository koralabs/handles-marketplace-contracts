use aiken/list
use aiken/transaction.{Datum, NoDatum, OutputReference, Transaction}
use aiken/transaction/credential.{Address}
use common/types.{VerificationKeyHash} as c_types
use common/utils.{build_datum_tag} as c_utils
use marketplace/types.{MarketplaceDatum}
use marketplace/utils.{
  check_marketplace_payout, check_payouts, find_payout_outputs,
}

pub fn can_buy(
  transaction: Transaction,
  datum: MarketplaceDatum,
  output_ref: OutputReference,
  payout_outputs_offset: Int,
  marketplace_address: Address,
  authorizers: List<VerificationKeyHash>,
) -> Bool {
  let Transaction { outputs, extra_signatories, .. } = transaction

  // for double satisfaction
  let datum_tag: Datum = build_datum_tag(output_ref)

  let MarketplaceDatum { payouts, .. } = datum

  // Find the `outputs` that correspond to `payouts`.
  let payout_outputs = find_payout_outputs(outputs, payout_outputs_offset)

  // We can ignore the fee check
  // if any of the authorizers have signed the tx.
  let can_have_discount =
    authorizers
      |> list.any(fn(authorizer) { list.has(extra_signatories, authorizer) })

  // If `can_have_discount` is `True` then we can
  // assume that jpg properly calculated the fee off chain.
  if can_have_discount {
    check_payouts(payout_outputs, payouts, datum_tag) > 0
  } else {
    // When there is a marketplace fee we can assume
    // it is the first of the `payout_outputs`.
    expect [marketplace_output, ..rest_outputs] = payout_outputs

    let payouts_sum = check_payouts(rest_outputs, payouts, NoDatum)

    // This approximates the marketplace fee given only the payouts to a very high degree.
    // For a payouts in excess of 100k ada the error is less than 40000 lovelace.
    let marketplace_fee = payouts_sum * 50 / 49 / 50

    // Make sure that the marketplace output
    // is correct.
    check_marketplace_payout(
      marketplace_output,
      marketplace_address,
      marketplace_fee,
      datum_tag,
    )
  }
}

pub fn can_withdraw_or_update(
  transaction: Transaction,
  datum: MarketplaceDatum,
) -> Bool {
  let Transaction { extra_signatories, .. } = transaction
  when list.has(extra_signatories, datum.owner) is {
    True -> True
    False -> {
      trace @"must be signed by owner"
      False
    }
  }
}
