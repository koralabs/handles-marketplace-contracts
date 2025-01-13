use aiken/builtin.{blake2b_256, serialise_data}
use aiken/list
use aiken/transaction.{
  InlineDatum, NoDatum, Output, OutputReference, TransactionId,
}
use aiken/transaction/credential.{
  Address, from_verification_key, with_delegation_key,
}
use aiken/transaction/value
use marketplace/types.{Payout}
use marketplace/utils.{
  check_marketplace_payout, check_payouts, find_payout_outputs,
}

fn maketplace_address() -> Address {
  from_verification_key(#"1234") |> with_delegation_key(#"1234")
}

test find_payout_outputs_1() {
  find_payout_outputs([1, 2, 3, 4], 2) == [3, 4]
}

test find_payout_outputs_2() {
  find_payout_outputs([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 10) == [11]
}

/// Test that `check_marketplace_payout` returns `True` when
/// given the correct arguments. That means, an `Output` with
/// an address equal to the hardcoded marketplace address, and
/// a value greater than or equal to the marketplace fee.
test check_marketplace_payout_valid_input() {
  let datum_tag =
    OutputReference {
      transaction_id: TransactionId { hash: #"00" },
      output_index: 0,
    }
      |> serialise_data
      |> blake2b_256
      |> InlineDatum

  let output =
    Output {
      address: maketplace_address(),
      value: value.from_lovelace(2000000),
      datum: datum_tag,
      reference_script: None,
    }

  check_marketplace_payout(output, maketplace_address(), 2000000, datum_tag)
}

/// This test makes sure that the marketplace payout
/// output address is the hardcoded marketplace credential.
/// If the output address does not match the marketplace address
/// `check_marketplace_payout` will return `False`.
test check_marketplace_payout_invalid_address() fail {
  let datum_tag =
    OutputReference {
      transaction_id: TransactionId { hash: #"00" },
      output_index: 0,
    }
      |> serialise_data
      |> blake2b_256
      |> InlineDatum

  let output =
    Output {
      // anything but the marketplace address
      address: credential.from_verification_key(
        #"fff60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
      ),
      value: value.from_lovelace(2000000),
      datum: datum_tag,
      reference_script: None,
    }

  check_marketplace_payout(output, maketplace_address(), 2000000, datum_tag)
}

/// This test makes sure that the marketplace payout
/// output value is greater than or equal to the marketplace fee.
/// If the value at the ouput is less than the marketplace fee
/// in the datum `check_marketplace_payout` will return `False`.
test check_marketplace_payout_incorrect_amount() fail {
  let datum_tag =
    OutputReference {
      transaction_id: TransactionId { hash: #"00" },
      output_index: 0,
    }
      |> serialise_data
      |> blake2b_256
      |> InlineDatum

  let output =
    Output {
      // anything but the marketplace address
      address: maketplace_address(),
      value: value.from_lovelace(1000000),
      datum: datum_tag,
      reference_script: None,
    }

  check_marketplace_payout(output, maketplace_address(), 2000000, datum_tag)
}

/// This test makes sure the `check_payouts` returns true
/// when give the correct inputs. It is safe to have trailing outputs
/// in the transaction as long as the payouts are correct.
test check_payouts_with_trailing_outputs() {
  let test_royalty_addr =
    credential.from_verification_key(
      #"80f60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_seller_addr =
    credential.from_verification_key(
      #"90f60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_random_addr =
    credential.from_verification_key(
      #"fff60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_royalty_payouts =
    [
      Payout { address: test_royalty_addr, amount_lovelace: 3000000 },
      Payout { address: test_seller_addr, amount_lovelace: 95000000 },
    ]

  let datum_tag =
    OutputReference {
      transaction_id: TransactionId { hash: #"00" },
      output_index: 0,
    }
      |> serialise_data
      |> blake2b_256
      |> InlineDatum

  let out_1 =
    Output {
      address: test_royalty_addr,
      value: value.from_lovelace(3100000),
      datum: datum_tag,
      reference_script: None,
    }

  let out_2 =
    Output {
      address: test_seller_addr,
      value: value.from_lovelace(95000000),
      datum: NoDatum,
      reference_script: None,
    }

  let out_random =
    Output {
      address: test_random_addr,
      value: value.from_lovelace(1000000),
      datum: datum_tag,
      reference_script: None,
    }

  let outputs = list.concat([out_1, out_2], list.repeat(out_random, 100))

  98000000 == check_payouts(outputs, test_royalty_payouts, datum_tag)
}

/// This test makes sure that `check_payouts` returns `False` when
/// the payout outputs are not sequential. If a random output is in between
/// payout outputs then the transaction was constructed incorrectly.
test check_payouts_with_mixed_outputs() fail {
  let test_royalty_addr =
    credential.from_verification_key(
      #"80f60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_seller_addr =
    credential.from_verification_key(
      #"90f60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_random_addr =
    credential.from_verification_key(
      #"fff60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_royalty_payouts =
    [
      Payout { address: test_royalty_addr, amount_lovelace: 3000000 },
      Payout { address: test_seller_addr, amount_lovelace: 95000000 },
    ]

  let datum_tag =
    OutputReference {
      transaction_id: TransactionId { hash: #"00" },
      output_index: 0,
    }
      |> serialise_data
      |> blake2b_256
      |> InlineDatum

  let out_1 =
    Output {
      address: test_royalty_addr,
      value: value.from_lovelace(3000000),
      datum: datum_tag,
      reference_script: None,
    }

  let out_2 =
    Output {
      address: test_seller_addr,
      value: value.from_lovelace(95000000),
      datum: NoDatum,
      reference_script: None,
    }

  let out_random =
    Output {
      address: test_random_addr,
      value: value.from_lovelace(1000000),
      datum: NoDatum,
      reference_script: None,
    }

  98000000 == check_payouts(
    [out_1, out_random, out_2],
    test_royalty_payouts,
    datum_tag,
  )
}

/// This test checks that the check_payouts function works correctly when
/// when the output list has leading outputs that are not part of the
/// payouts. It should return `False` because we expect the leading outputs
/// to have been filtered out before using this function.
test check_payouts_with_leading_outputs() fail {
  let test_royalty_addr =
    credential.from_verification_key(
      #"80f60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_seller_addr =
    credential.from_verification_key(
      #"90f60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_random_addr =
    credential.from_verification_key(
      #"fff60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_royalty_payouts =
    [
      Payout { address: test_royalty_addr, amount_lovelace: 3000000 },
      Payout { address: test_seller_addr, amount_lovelace: 95000000 },
    ]

  let datum_tag =
    OutputReference {
      transaction_id: TransactionId { hash: #"00" },
      output_index: 0,
    }
      |> serialise_data
      |> blake2b_256
      |> InlineDatum

  let out_1 =
    Output {
      address: test_royalty_addr,
      value: value.from_lovelace(3000000),
      datum: datum_tag,
      reference_script: None,
    }

  let out_2 =
    Output {
      address: test_seller_addr,
      value: value.from_lovelace(95000000),
      datum: NoDatum,
      reference_script: None,
    }

  let out_random =
    Output {
      address: test_random_addr,
      value: value.from_lovelace(1000000),
      datum: NoDatum,
      reference_script: None,
    }

  let outputs = list.concat(list.repeat(out_random, 100), [out_1, out_2])

  98000000 == check_payouts(outputs, test_royalty_payouts, datum_tag)
}

/// If the payout output value does not match the datum payout amount
/// then `check_payouts` should return `False`.
test check_payouts_with_wrong_amounts() fail {
  let test_royalty_addr =
    credential.from_verification_key(
      #"80f60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_seller_addr =
    credential.from_verification_key(
      #"90f60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_random_addr =
    credential.from_verification_key(
      #"fff60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_royalty_payouts =
    [
      Payout { address: test_royalty_addr, amount_lovelace: 3000000 },
      Payout { address: test_seller_addr, amount_lovelace: 95000000 },
    ]

  let datum_tag =
    OutputReference {
      transaction_id: TransactionId { hash: #"00" },
      output_index: 0,
    }
      |> serialise_data
      |> blake2b_256
      |> InlineDatum

  let out_1 =
    Output {
      address: test_royalty_addr,
      value: value.from_lovelace(3000000),
      datum: datum_tag,
      reference_script: None,
    }

  let out_2 =
    Output {
      address: test_seller_addr,
      value: value.from_lovelace(85000000),
      datum: NoDatum,
      reference_script: None,
    }

  let out_random =
    Output {
      address: test_random_addr,
      value: value.from_lovelace(1000000),
      datum: NoDatum,
      reference_script: None,
    }

  let outputs = list.concat([out_1, out_2], list.repeat(out_random, 100))

  98000000 == check_payouts(outputs, test_royalty_payouts, datum_tag)
}

/// If the payout output address does not match the datum payout address 
/// then `check_payouts` should return `False`.
test check_payouts_with_wrong_address() fail {
  let test_royalty_addr =
    credential.from_verification_key(
      #"80f60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_seller_addr =
    credential.from_verification_key(
      #"90f60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_random_addr =
    credential.from_verification_key(
      #"fff60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_royalty_payouts =
    [
      Payout { address: test_royalty_addr, amount_lovelace: 3000000 },
      Payout { address: test_seller_addr, amount_lovelace: 95000000 },
    ]

  let datum_tag =
    OutputReference {
      transaction_id: TransactionId { hash: #"00" },
      output_index: 0,
    }
      |> serialise_data
      |> blake2b_256
      |> InlineDatum

  let out_1 =
    Output {
      address: credential.from_verification_key(
        #"fff60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
      ),
      value: value.from_lovelace(3000000),
      datum: datum_tag,
      reference_script: None,
    }

  let out_2 =
    Output {
      address: test_seller_addr,
      value: value.from_lovelace(95000000),
      datum: NoDatum,
      reference_script: None,
    }

  let out_random =
    Output {
      address: test_random_addr,
      value: value.from_lovelace(1000000),
      datum: datum_tag,
      reference_script: None,
    }

  let outputs = list.concat([out_1, out_2], list.repeat(out_random, 100))

  98000000 == check_payouts(outputs, test_royalty_payouts, datum_tag)
}

/// Test that things work with a single payout
test check_payouts_with_single_payout() {
  let test_royalty_addr =
    credential.from_verification_key(
      #"80f60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_random_addr =
    credential.from_verification_key(
      #"fff60f3b5ea7153e0acc7a803e4401d44b8ed1bae1c7baaad1a62a81",
    )

  let test_royalty_payouts =
    [Payout { address: test_royalty_addr, amount_lovelace: 3000000 }]

  let datum_tag =
    OutputReference {
      transaction_id: TransactionId { hash: #"00" },
      output_index: 0,
    }
      |> serialise_data
      |> blake2b_256
      |> InlineDatum

  let out_1 =
    Output {
      address: test_royalty_addr,
      value: value.from_lovelace(3000000),
      datum: datum_tag,
      reference_script: None,
    }

  let out_random =
    Output {
      address: test_random_addr,
      value: value.from_lovelace(1000000),
      datum: NoDatum,
      reference_script: None,
    }

  let outputs = list.concat([out_1], list.repeat(out_random, 100))

  3000000 == check_payouts(outputs, test_royalty_payouts, datum_tag)
}
