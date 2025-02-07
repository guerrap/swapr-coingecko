import { Handler } from "aws-lambda";
import { JsonRpcProvider } from "@ethersproject/providers";
import { multicall } from "../utils/multicall";
import { ChainId, SWPR, SWPR_CONVERTER_ADDRESS } from "@swapr/sdk";
import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { BigNumber } from "@ethersproject/bignumber";
import { formatUnits, parseUnits } from "@ethersproject/units";

const basicErc20Interface = new Interface([
  "function balanceOf(address) view returns (uint256)",
]);
const balanceOfFunction = basicErc20Interface.getFunction("balanceOf(address)");

const getMainnetBalances = async (): Promise<{
  daoBalance: BigNumber;
  burntBalance: BigNumber;
}> => {
  const provider = new JsonRpcProvider(
    `https://mainnet.infura.io/v3/${process.env.INFURA_ID}`
  );

  const swprAddress = SWPR[ChainId.MAINNET].address;
  const results = await multicall(ChainId.MAINNET, provider, [
    {
      to: swprAddress,
      data: basicErc20Interface.encodeFunctionData(balanceOfFunction, [
        "0x519b70055af55a007110b4ff99b0ea33071c720a", // DAO's avatar address on mainnet
      ]),
    },
    {
      to: swprAddress,
      data: basicErc20Interface.encodeFunctionData(balanceOfFunction, [
        AddressZero,
      ]),
    },
  ]);
  return {
    daoBalance: basicErc20Interface.decodeFunctionResult(
      balanceOfFunction,
      results.returnData[0]
    )[0],
    burntBalance: basicErc20Interface.decodeFunctionResult(
      balanceOfFunction,
      results.returnData[1]
    )[0],
  };
};

const getArbitrumOneBalances = async (): Promise<{
  daoBalance: BigNumber;
  swaprWalletSchemeBalance: BigNumber;
  unconvertedBalance: BigNumber;
}> => {
  const provider = new JsonRpcProvider(`https://arb1.arbitrum.io/rpc`);

  const swprAddress = SWPR[ChainId.ARBITRUM_ONE].address;
  const results = await multicall(ChainId.ARBITRUM_ONE, provider, [
    {
      to: swprAddress,
      data: basicErc20Interface.encodeFunctionData(balanceOfFunction, [
        "0x2B240b523f69b9aF3adb1C5924F6dB849683A394", // DAO's avatar address on arb1
      ]),
    },
    {
      to: swprAddress,
      data: basicErc20Interface.encodeFunctionData(balanceOfFunction, [
        "0x3172eDDa6ff8B2b2Fa7FeD40EE1fD92F1F4dd424", // DAO's Swapr wallet scheme address on arb1
      ]),
    },
    // the following call gets all the unconverted SWPR currently sitting in the converter
    {
      to: swprAddress,
      data: basicErc20Interface.encodeFunctionData(balanceOfFunction, [
        SWPR_CONVERTER_ADDRESS[ChainId.ARBITRUM_ONE],
      ]),
    },
  ]);

  return {
    daoBalance: basicErc20Interface.decodeFunctionResult(
      balanceOfFunction,
      results.returnData[0]
    )[0],
    swaprWalletSchemeBalance: basicErc20Interface.decodeFunctionResult(
      balanceOfFunction,
      results.returnData[1]
    )[0],
    unconvertedBalance: basicErc20Interface.decodeFunctionResult(
      balanceOfFunction,
      results.returnData[2]
    )[0],
  };
};

export const circulatingSupply: Handler = async () => {
  const { daoBalance: mainnetDaoBalance, burntBalance } =
    await getMainnetBalances();
  const {
    daoBalance: arbitrumOneDaoBalance,
    swaprWalletSchemeBalance,
    unconvertedBalance,
  } = await getArbitrumOneBalances();

  const circulatingSupply = parseUnits("100000000", 18)
    .sub(mainnetDaoBalance)
    .sub(burntBalance)
    .sub(arbitrumOneDaoBalance)
    .sub(swaprWalletSchemeBalance)
    .sub(unconvertedBalance);

  return {
    statusCode: 200,
    body: JSON.stringify({
      mainnetDaoBalance: formatUnits(mainnetDaoBalance, 18),
      burntBalance: formatUnits(burntBalance, 18),
      arbitrumOneDaoBalance: formatUnits(arbitrumOneDaoBalance, 18),
      swaprWalletSchemeBalance: formatUnits(swaprWalletSchemeBalance, 18),
      unconvertedBalance: formatUnits(unconvertedBalance, 18),
      circulatingSupply: formatUnits(circulatingSupply, 18),
    }),
  };
};
