use aiken/transaction.{ScriptContext}
use aiken/transaction/credential.{Address}
use common/types.{VerificationKeyHash} as c_types
use common/utils.{get_spending_output_reference}
use marketplace/types.{MarketplaceDatum}
use marketplace/validation.{can_buy, can_withdraw_or_update}

/// A user can either buy a token
/// or cancel/update the listing.
pub type MarketplaceRedeemer {
  /// `payout_outputs_offset` tells us where
  /// the outputs containing the payouts start.
  Buy { payout_outputs_offset: Int }
  /// Cancel or update a listing.
  WithdrawOrUpdate
}

validator(
  marketplace_address: Address,
  authorizers: List<VerificationKeyHash>,
) {
  /// Validate that the signer is the owner or that payouts
  /// are present as outputs and that the tag is correct.
  fn spend(
    datum: MarketplaceDatum,
    redeemer: MarketplaceRedeemer,
    ctx: ScriptContext,
  ) -> Bool {
    let ScriptContext { transaction, purpose } = ctx
    let output_ref = get_spending_output_reference(purpose)

    // Match on the action.
    when redeemer is {
      Buy { payout_outputs_offset } ->
        can_buy(
          transaction,
          datum,
          output_ref,
          payout_outputs_offset,
          marketplace_address,
          authorizers,
        )

      // There's not much to do here. An asset
      // owner can cancel or update their listing
      // at any time.
      WithdrawOrUpdate ->
        // is signed by owner
        can_withdraw_or_update(transaction, datum)
    }
  }
}
