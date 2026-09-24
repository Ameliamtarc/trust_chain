pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

// Proves that up to eight private support-cost amounts fit under a public
// percentage of a public milestone budget. Amounts use the token's 18-decimal
// base units. The proof does not establish that the source invoices are true.
template SupportCosts(maxItems) {
    signal input items[maxItems];
    signal input salt;
    signal input commitment;
    signal input budget;
    signal input maxShareBps;

    signal totalCost;
    signal leftSide;
    signal rightSide;

    component itemBits[maxItems];
    signal partialSums[maxItems + 1];
    partialSums[0] <== 0;

    for (var i = 0; i < maxItems; i++) {
        itemBits[i] = Num2Bits(128);
        itemBits[i].in <== items[i];
        partialSums[i + 1] <== partialSums[i] + items[i];
    }

    totalCost <== partialSums[maxItems];
    component totalBits = Num2Bits(132);
    totalBits.in <== totalCost;

    component budgetBits = Num2Bits(128);
    budgetBits.in <== budget;

    component shareWithinRange = LessEqThan(14);
    shareWithinRange.in[0] <== maxShareBps;
    shareWithinRange.in[1] <== 10000;
    shareWithinRange.out === 1;

    leftSide <== totalCost * 10000;
    rightSide <== maxShareBps * budget;

    component leftBits = Num2Bits(146);
    leftBits.in <== leftSide;
    component rightBits = Num2Bits(142);
    rightBits.in <== rightSide;

    component withinCap = LessEqThan(146);
    withinCap.in[0] <== leftSide;
    withinCap.in[1] <== rightSide;
    withinCap.out === 1;

    component itemCommitment = Poseidon(maxItems + 1);
    for (var j = 0; j < maxItems; j++) {
        itemCommitment.inputs[j] <== items[j];
    }
    itemCommitment.inputs[maxItems] <== salt;
    itemCommitment.out === commitment;
}

// Circom outputs are public automatically. The only public inputs are the
// commitment, exact milestone budget, and maximum percentage in basis points.
component main {public [commitment, budget, maxShareBps]} = SupportCosts(8);
