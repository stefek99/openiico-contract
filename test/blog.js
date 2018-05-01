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
    await iico.searchAndBid(infinity, 0,{from: buyerA, value:6E18}) // Alice's bid 
    increaseTime(5125) // 125 elapsed, 1/20 of 2500
    await iico.searchAndBid(20E18, 1,{from: buyerB, value:10E18}) // Bob's bid, bonus 19%
    increaseTime(125) // another 125 elapsed, 2/20 of 2500
    await iico.searchAndBid(25E18, 2,{from: buyerC, value:5E18}) // Carl's bid, bonus 18%

    // He will only be able to withdraw whatever percentage is left of the first phase. 
    // Carl withdraws manually 80% of the way through the end of the first phase. 

    increaseTime(1750 - 1); // now it's 2000 of 2500 partialWithdrawalLength, which equal to 80%, therefore returning 20% of the bid

    let CarlBalanceBeforeReimbursment = web3.eth.getBalance(buyerC)
    console.log(CarlBalanceBeforeReimbursment.toNumber());

    await expectThrow(iico.withdraw(3,{from: buyerB})) // Only the contributor can withdraw.
    let tx = await iico.withdraw(3,{from: buyerC, gasPrice: gasPrice})
    let txFee = tx.receipt.gasUsed * gasPrice
    let CarlBalanceAfterReimbursment = web3.eth.getBalance(buyerC)

    console.log(CarlBalanceAfterReimbursment.toNumber());
    console.log((CarlBalanceAfterReimbursment - CarlBalanceBeforeReimbursment) / 1E18);

    // THERE IS A MISMATCH HERE
    // I'm increasing the time manually
    // Does the transcations itself change the time too?
    // Before I spent ages debugging, please address this concern

    assert.equal(CarlBalanceBeforeReimbursment.plus(1E18).minus(txFee).toNumber(), CarlBalanceAfterReimbursment.toNumber(), 'Reimbursement amount not correct')
    
    // await expectThrow(iico.withdraw(3,{from: buyerC, gasPrice: gasPrice})) 

  })
})

