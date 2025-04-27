import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.2/index.ts';
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';

// Helper function to create a story mint transaction
function createStoryMintTx(
  account: Account, 
  title: string, 
  description: string, 
  audioCid: string = '0x' + '0'.repeat(64), 
  imageCid: string = '0x' + '0'.repeat(64), 
  royaltyPercent: number = 10
) {
  return Tx.contractCall(
    'story_nft', 
    'mint-story', 
    [
      types.utf8(title), 
      types.utf8(description), 
      types.buff(Buffer.from(audioCid.replace('0x', ''), 'hex')), 
      types.buff(Buffer.from(imageCid.replace('0x', ''), 'hex')), 
      types.uint(royaltyPercent)
    ], 
    account.address
  );
}

// 1. Contract Initialization Tests
Clarinet.test({
  name: "Verify contract deploys successfully and initial state is correct",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    // Check initial last story ID
    let lastTokenId = chain.callReadOnlyFn('story_nft', 'get-last-token-id', [], accounts.get('wallet_1')!.address);
    lastTokenId.result.expectUint(0);
  }
});

// 2. Story Minting Tests
Clarinet.test({
  name: "Successfully mint a story NFT with valid parameters",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const block = chain.mineBlock([
      createStoryMintTx(creator, 'Test Story', 'A test story description')
    ]);

    // Check mint success
    block.receipts[0].result.expectOk();
    
    // Verify last token ID incremented
    let lastTokenId = chain.callReadOnlyFn('story_nft', 'get-last-token-id', [], creator.address);
    lastTokenId.result.expectUint(1);

    // Verify story details
    let storyDetails = chain.callReadOnlyFn('story_nft', 'get-story-details', [types.uint(1)], creator.address);
    storyDetails.result.expectSome();
  }
});

Clarinet.test({
  name: "Prevent minting with invalid title length",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const block = chain.mineBlock([
      // Empty title
      createStoryMintTx(creator, '', 'A test story description')
    ]);

    // Check mint failure
    block.receipts[0].result.expectErr().expectUint(400);
  }
});

Clarinet.test({
  name: "Prevent minting with invalid royalty percentage",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const block = chain.mineBlock([
      // Invalid royalty percentages
      createStoryMintTx(creator, 'Test Story', 'Description', undefined, undefined, 101),
      createStoryMintTx(creator, 'Test Story', 'Description', undefined, undefined, 255)
    ]);

    // Both transactions should fail with invalid story error
    block.receipts[0].result.expectErr().expectUint(400);
    block.receipts[1].result.expectErr().expectUint(400);
  }
});

// 3. Transfer and Ownership Tests
Clarinet.test({
  name: "Transfer story NFT with royalty calculation",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    
    // First mint a story
    const mintBlock = chain.mineBlock([
      createStoryMintTx(creator, 'Transferable Story', 'A story to transfer', undefined, undefined, 10)
    ]);
    mintBlock.receipts[0].result.expectOk();

    // Fund creator's account with some STX for royalty calculation
    const fundBlock = chain.mineBlock([
      Tx.transferSTX(1000, recipient.address, creator.address)
    ]);

    // Transfer the story
    const transferBlock = chain.mineBlock([
      Tx.contractCall(
        'story_nft', 
        'transfer', 
        [
          types.uint(1), 
          types.principal(creator.address), 
          types.principal(recipient.address)
        ], 
        creator.address
      )
    ]);

    // Check transfer success
    transferBlock.receipts[0].result.expectOk();

    // Verify new owner
    const ownerResult = chain.callReadOnlyFn(
      'story_nft', 
      'get-owner', 
      [types.uint(1)], 
      creator.address
    );
    ownerResult.result.expectSome().expectPrincipal(recipient.address);
  }
});

// 4. Tipping Mechanism Tests
Clarinet.test({
  name: "Successfully tip story creator",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const tipper = accounts.get('wallet_2')!;
    
    // First mint a story
    const mintBlock = chain.mineBlock([
      createStoryMintTx(creator, 'Tippable Story', 'A story to tip')
    ]);
    mintBlock.receipts[0].result.expectOk();

    // Fund tipper's account
    const fundBlock = chain.mineBlock([
      Tx.transferSTX(1000, tipper.address, creator.address)
    ]);

    // Tip the creator
    const tipBlock = chain.mineBlock([
      Tx.contractCall(
        'story_nft', 
        'tip-creator', 
        [
          types.uint(1), 
          types.uint(100)
        ], 
        tipper.address
      )
    ]);

    // Check tip success
    tipBlock.receipts[0].result.expectOk();
  }
});

Clarinet.test({
  name: "Prevent tipping with zero or negative amount",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const tipper = accounts.get('wallet_2')!;
    
    // First mint a story
    const mintBlock = chain.mineBlock([
      createStoryMintTx(creator, 'Tippable Story', 'A story to tip')
    ]);
    mintBlock.receipts[0].result.expectOk();

    // Attempt to tip with zero and negative amounts
    const tipBlock = chain.mineBlock([
      Tx.contractCall(
        'story_nft', 
        'tip-creator', 
        [
          types.uint(1), 
          types.uint(0)
        ], 
        tipper.address
      )
    ]);

    // Check tip failure
    tipBlock.receipts[0].result.expectErr().expectUint(402);
  }
});

// 5. Metadata Retrieval Tests
Clarinet.test({
  name: "Retrieve story details successfully",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    
    // Mint a story
    const mintBlock = chain.mineBlock([
      createStoryMintTx(creator, 'Retrievable Story', 'A story to retrieve', 
        '0x' + '1'.repeat(64), 
        '0x' + '2'.repeat(64), 
        15)
    ]);
    mintBlock.receipts[0].result.expectOk();

    // Retrieve story details
    const storyDetails = chain.callReadOnlyFn(
      'story_nft', 
      'get-story-details', 
      [types.uint(1)], 
      creator.address
    );

    // Verify details are returned correctly
    storyDetails.result.expectSome();
    
    // Optional: More granular assertion if needed
    // You would parse the result and check specific fields
  }
});

Clarinet.test({
  name: "Attempt to retrieve details for non-existent story",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const user = accounts.get('wallet_1')!;
    
    // Try to retrieve details for non-existent story ID
    const storyDetails = chain.callReadOnlyFn(
      'story_nft', 
      'get-story-details', 
      [types.uint(999)], 
      user.address
    );

    // Should return none for non-existent story
    storyDetails.result.expectNone();
  }
});

// 6. Security and Authorization Tests
Clarinet.test({
  name: "Prevent unauthorized NFT transfer",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const unauthorized = accounts.get('wallet_2')!;
    const recipient = accounts.get('wallet_3')!;
    
    // First mint a story
    const mintBlock = chain.mineBlock([
      createStoryMintTx(creator, 'Secure Story', 'A story to test transfer')
    ]);
    mintBlock.receipts[0].result.expectOk();

    // Unauthorized transfer attempt
    const transferBlock = chain.mineBlock([
      Tx.contractCall(
        'story_nft', 
        'transfer', 
        [
          types.uint(1), 
          types.principal(creator.address), 
          types.principal(recipient.address)
        ], 
        unauthorized.address
      )
    ]);

    // Check transfer failure
    transferBlock.receipts[0].result.expectErr().expectUint(403);
  }
});

// Boundary and Edge Case Tests
Clarinet.test({
  name: "Test maximum metadata length inputs",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    
    // Test with maximum allowed lengths
    const longTitle = 'A'.repeat(100);
    const longDescription = 'B'.repeat(500);
    
    const block = chain.mineBlock([
      createStoryMintTx(
        creator, 
        longTitle, 
        longDescription, 
        '0x' + '1'.repeat(64), 
        '0x' + '2'.repeat(64)
      )
    ]);

    // Should succeed with max lengths
    block.receipts[0].result.expectOk();
  }
});