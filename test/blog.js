/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const { expectThrow, increaseTime } = require('kleros-interaction/helpers/utils')
const MintableToken = artifacts.require('zeppelin-solidity/MintableToken.sol')
const IICO = artifacts.require('IICO.sol')

// Testing the case presented in the blog
// https://medium.com/kleros/how-interactive-coin-offerings-iicos-work-beed401ce526

contract('IICO', function (accounts) {
  let owner = accounts[0]
  let beneficiary = accounts[1]
  let buyerA = accounts[2]
  let buyerB = accounts[3]
  let buyerC = accounts[4]
  let buyerD = accounts[5]
  let buyerE = accounts[6]
  let buyerF = accounts[7]
  let gasPrice = 5E9

  let timeBeforeStart = 1000
  let fullBonusLength = 5000
  let partialWithdrawalLength = 2500
  let withdrawalLockUpLength = 2500
  let maxBonus = 2E8
  testAccount = buyerE
  let infinity = 120000000E18; // 120m ETH as a "infinite" cap
  
  it('Test case from the blog', async () => {
    let startTestTime = web3.eth.getBlock('latest').timestamp
    let iico = await IICO.new(startTestTime+timeBeforeStart,fullBonusLength,partialWithdrawalLength, withdrawalLockUpLength,maxBonus,beneficiary,{from: owner})
    let head = await iico.bids(0)
    let tailID = head[1]
    let tail = await iico.bids(head[1])
    let token = await MintableToken.new({from: owner})
    await token.mint(iico.address,100E18,{from: owner}) // We will use a 100 PNK sale for the example.
    await iico.setToken(token.address,{from: owner})
    
    increaseTime(1000) // Full bonus period.
    /* ALICE */ await iico.searchAndBid(infinity, 0,{from: buyerA, value:6E18}) // Alice's bid 
    increaseTime(5250) // 250 elapsed, 1/20 of 2500+2500
    /* BOB */ await iico.searchAndBid(20E18, 1,{from: buyerB, value:10E18}) // Bob's bid, bonus 19%
    increaseTime(250) // another 250 elapsed, 2/20 of 2500
    /* CARL */ await iico.searchAndBid(25E18, 2,{from: buyerC, value:5E18}) // Carl's bid, bonus 18%

    // He will only be able to withdraw whatever percentage is left of the first phase. 
    // Carl withdraws manually 80% of the way through the end of the first phase. 
    increaseTime(1500); // now it's 2000 of 2500 partialWithdrawalLength, which equal to 80%, therefore returning 20% of the bid

    let CarlBalanceBeforeReimbursment = web3.eth.getBalance(buyerC)
    var CarlsBidBefore = await iico.bids.call(3);
    var CarlsBidBeforeBonus = CarlsBidBefore[4].toNumber(); // it's a struct, getting 4 field
    assert.closeTo(CarlsBidBeforeBonus, 1.8E8, 0.01E8, 'Bonus amount not correct before withdrawing the bid');

    await expectThrow(iico.withdraw(3,{from: buyerB})) // Only the contributor can withdraw.
    let tx = await iico.withdraw(3,{from: buyerC, gasPrice: gasPrice})
    await expectThrow(iico.withdraw(3,{from: buyerC, gasPrice: gasPrice})) // cannot withdraw more than once
    let txFee = tx.receipt.gasUsed * gasPrice
    let CarlBalanceAfterReimbursment = web3.eth.getBalance(buyerC)
    assert.closeTo(CarlBalanceBeforeReimbursment.plus(1E18).minus(txFee).toNumber(), CarlBalanceAfterReimbursment.toNumber(), 0.005*1E18, 'Reimbursement amount not correct');

    var CarlsBidAfter = await iico.bids.call(3);
    var CarlsBidAfterBonus = CarlsBidAfter[4].toNumber();
    assert.closeTo(CarlsBidAfterBonus, 0.6E8, 0.01E8, 'Bonus amount not correct, after withdrawal of the bid (divided by 3)');

    // Now David, after seeing how the sale is evolving, decides that he also wants some tokens 
    // and contributes 4 ETH with a personal cap of 24 ETH. He gets an 8% bonus. 
    increaseTime(1000) // now it is 3000 out of 5000
    /* DAVID */ await iico.searchAndBid(24E18, 3, {from: buyerC, value:4E18}) // Davids's bid, bonus 8%
    var DavidsBid = await iico.bids.call(4);
    var DavidsBidBonus = DavidsBid[4].toNumber();
    assert.closeTo(DavidsBidBonus, 0.8E8, 0.01E8, 'Bonus amount not correct');

    increaseTime(1E4) // End of sale.
    
    let buyerABalanceAtTheEndOfSale = web3.eth.getBalance(buyerA).toNumber()
    let buyerBBalanceAtTheEndOfSale = web3.eth.getBalance(buyerB).toNumber()
    let buyerCBalanceAtTheEndOfSale = web3.eth.getBalance(buyerC).toNumber()
    let buyerDBalanceAtTheEndOfSale = web3.eth.getBalance(buyerD).toNumber()
    let beneficiaryBalanceAtTheEndOfSale = web3.eth.getBalance(beneficiary).toNumber()
    
    await iico.finalize(1000)
    
    // Redeem and verify we can't redeem more than once.
    await iico.redeem(1)
    await expectThrow(iico.redeem(1))
    await iico.redeem(2)
    await expectThrow(iico.redeem(2))
    await iico.redeem(3)
    await expectThrow(iico.redeem(3))
    await iico.redeem(4)
    await expectThrow(iico.redeem(4))

    
    // Verify the proper amounts of ETH are refunded.
    assert.equal(web3.eth.getBalance(buyerA).toNumber(), buyerABalanceAtTheEndOfSale, 'The buyer A has been given ETH back while the full bid should have been accepted')
    assert.equal(web3.eth.getBalance(buyerB).toNumber(), buyerBBalanceAtTheEndOfSale + 10E18, 'The buyer B has been given ETH back while the full bid should have been accepted')
    assert.equal(web3.eth.getBalance(buyerC).toNumber(), buyerCBalanceAtTheEndOfSale, 'The buyer C has been given ETH back while the full bid should have been accepted')
    assert.equal(web3.eth.getBalance(buyerD).toNumber(), buyerDBalanceAtTheEndOfSale, 'The buyer D has been given ETH back while the full bid should have been accepted')
    
    assert.equal(web3.eth.getBalance(beneficiary).toNumber(), beneficiaryBalanceAtTheEndOfSale+14E18, 'The beneficiary has not been paid correctly')
    
    // Verify that the tokens are correctly distributed.
    // assert.equal((await token.balanceOf(buyerA)).toNumber(), 30E24, 'The buyer A has not been given the right amount of tokens')
    // assert.equal((await token.balanceOf(buyerB)).toNumber(), 10E24, 'The buyer B has not been given the right amount of tokens')
    // assert.equal((await token.balanceOf(buyerC)).toNumber(), 0, 'The buyer C has withdrawn completely but still got tokens')
    // assert.equal((await token.balanceOf(buyerD)).toNumber(), 20E24, 'The buyer D has not been given the right amount of tokens')
    // assert.equal((await token.balanceOf(buyerE)).toNumber(), 0, 'The buyer E got some tokens despite having its bid refunded')
    // assert.equal((await token.balanceOf(buyerF)).toNumber(), 0, 'The buyer F got some tokens despite having its bid refunded')    


  })
})

