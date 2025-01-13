use aiken/builtin.{tail_list}
use aiken/transaction.{Datum, NoDatum, Output}
use aiken/transaction/credential.{Address}
use common/utils.{must_have_only_lovelace, split_first_and_rest}
use marketplace/types.{Payout}

/// Find the outputs that match the list of payouts.
/// We use a heuristic function combined with the given 
/// redeemer offset to jump 10 at a time towards first output to validate.
/// This saves a massive amount in budget allowing us to support 40+ inputs.
/// If the wrong offset is given then the script will fail or cost more.
/// The resulting `Output` list may contain more outputs than payouts. But
/// we expect the transaction to NOT have alternating payout outputs and random
/// outputs. This means you cannot construct transactions that have outputs
/// like this: `[payout, random, payout]`. An example of a valid set of outputs
/// would be: `[random, payout, payout, random]`.
/// This is pretty much `list.drop` but optimized for our situation.
pub fn find_payout_outputs(
  outputs: List<a>,
  payout_outputs_offset: Int,
) -> List<a> {
  if payout_outputs_offset >= 10 {
    outputs
      |> skip_10_items
      |> find_payout_outputs(payout_outputs_offset - 10)
  } else {
    do_find_payout_outputs(outputs, payout_outputs_offset)
  }
}

fn do_find_payout_outputs(outputs: List<a>, current_index: Int) -> List<a> {
  if current_index == 0 {
    outputs
  } else {
    outputs
      |> tail_list
      |> do_find_payout_outputs(current_index - 1)
  }
}

/// Small utility to skip 10 items in a list.
/// Used by `find_payout_outputs`.
fn skip_10_items(some_list: List<a>) -> List<a> {
  some_list
    |> tail_list
    |> tail_list
    |> tail_list
    |> tail_list
    |> tail_list
    |> tail_list
    |> tail_list
    |> tail_list
    |> tail_list
    |> tail_list
}

/// This function is used only if a discount
/// is not allowed (tx not signed by koralabs). The main difference
/// from `check_payouts` is that we make sure the
/// output address matches a hardcoded marketplace address
/// along with confirming that the output value equals
/// the marketplace_fee. In this case there is no `Payout`
/// to compare to.
pub fn check_marketplace_payout(
  output: Output,
  marketplace_address: Address,
  marketplace_fee: Int,
  marketplace_output_datum_tag: Datum,
) -> Bool {
  let Output { address: output_address, value: output_value, datum, .. } =
    output

  // check marketplace output's datum is tagged
  expect datum == marketplace_output_datum_tag

  // Match hardcoded marketplace address
  expect output_address == marketplace_address

  // Output value quantity must equal the marketplace fee
  // this prevents people from not paying a fee by submitting
  // transactions not constructed by Koralabs.
  let quantity = must_have_only_lovelace(output_value)
  expect quantity >= marketplace_fee

  True
}

/// Check that payouts and payout outputs
/// are correct. Payouts are stored in the datum
/// when assets are listed. On buy a transaction
/// with matching payout outputs needs to be constructed.
/// We also require that outputs are in the same order as the
/// payouts in the datum. Returns the sum of the payout amounts.
pub fn check_payouts(
  outputs: List<Output>,
  payouts: List<Payout>,
  datum_tag: Datum,
) -> Int {
  let (first_output, rest_outputs) =
    split_first_and_rest(outputs, @"outputs are empty")
  let Output { address: output_address, value: output_value, datum, .. } =
    first_output

  // check first output's datum is tagged
  expect datum == datum_tag

  let (first_payout, rest_payouts) =
    split_first_and_rest(payouts, @"payouts are empty")
  let Payout { address: payout_address, amount_lovelace } = first_payout

  // The `Output` address must match
  // the address specified in the corresponding
  // payout from the datum.
  expect payout_address == output_address

  // The quantity in the output must equal
  // the amount specified in the corresponding
  // payout from the datum.
  let quantity = must_have_only_lovelace(output_value)
  expect quantity >= amount_lovelace && amount_lovelace > 0

  let rest_payouts_amount =
    when rest_payouts is {
      // the base case
      [] ->
        // if rest is empty we are done
        0
      _ ->
        // continue with remaining outputs and payouts
        check_payouts_aux(rest_outputs, rest_payouts)
    }

  amount_lovelace + rest_payouts_amount
}

pub fn check_payouts_aux(outputs: List<Output>, payouts: List<Payout>) -> Int {
  let (first_output, rest_outputs) =
    split_first_and_rest(outputs, @"aux outputs are empty")
  let Output { address: output_address, value: output_value, datum, .. } =
    first_output

  // check reset output's datum is none
  expect datum == NoDatum

  let (first_payout, rest_payouts) =
    split_first_and_rest(payouts, @"aux payouts are empty")
  let Payout { address: payout_address, amount_lovelace } = first_payout

  // The `Output` address must match
  // the address specified in the corresponding
  // payout from the datum.
  expect payout_address == output_address

  // The quantity in the output must equal
  // the amount specified in the corresponding
  // payout from the datum.
  let quantity = must_have_only_lovelace(output_value)
  expect quantity >= amount_lovelace && amount_lovelace > 0

  let rest_payouts_amount =
    when rest_payouts is {
      // the base case
      [] ->
        // if rest is empty we are done
        0
      _ ->
        // continue with remaining outputs and payouts
        check_payouts_aux(rest_outputs, rest_payouts)
    }

  amount_lovelace + rest_payouts_amount
}
