use aiken/builtin.{blake2b_256, serialise_data}
use aiken/dict
use aiken/transaction.{Datum,
  InlineDatum, OutputReference, ScriptPurpose, Spend}
use aiken/transaction/value.{Value, ada_policy_id, to_dict}

pub fn must_have_only_lovelace(val: Value) -> Int {
  let Pair(policy, tokens) =
    when
      val
        |> to_dict
        |> dict.to_pairs
    is {
      [ada_policy_token] -> ada_policy_token
      _ -> fail @"must have only lovelace"
    }

  let Pair(_, quantity) =
    when dict.to_pairs(tokens) is {
      [lovelace_token] -> lovelace_token
      _ -> fail @"must have only lovelace"
    }

  when policy == ada_policy_id is {
    True -> quantity
    False -> fail @"must have only lovelace"
  }
}

pub fn split_first_and_rest(self: List<a>, msg: String) -> (a, List<a>) {
  when self is {
    [head, ..tail] -> (head, tail)
    _ -> fail msg
  }
}

pub fn get_spending_output_reference(purpose: ScriptPurpose) -> OutputReference {
  when purpose is {
    Spend(out_ref) -> out_ref
    _ -> fail @"must be executed as a spending validator"
  }
}

pub fn build_datum_tag(output_ref: OutputReference) -> Datum {
  output_ref
    |> serialise_data
    |> blake2b_256
    |> InlineDatum
}
