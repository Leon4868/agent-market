import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const AgentTaskEscrowModule = buildModule("AgentTaskEscrowModule", (m) => {
  const deployer = m.getAccount(0);
  // D5a: the deployer arbitrates until setArbiter hands the role to a multisig.
  const arbiter = m.getParameter("arbiter", deployer);
  const escrow = m.contract("AgentTaskEscrow", [deployer, arbiter]);

  return { escrow };
});

export default AgentTaskEscrowModule;
