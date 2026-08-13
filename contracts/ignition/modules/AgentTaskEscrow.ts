import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const AgentTaskEscrowModule = buildModule("AgentTaskEscrowModule", (m) => {
  const deployer = m.getAccount(0);
  const escrow = m.contract("AgentTaskEscrow", [deployer]);

  return { escrow };
});

export default AgentTaskEscrowModule;
