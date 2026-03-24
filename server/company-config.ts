interface CompanyPickupPointConfig {
  operations: number[];
  reports: number[];
}

const companyPickupPointConfigs: Record<number, CompanyPickupPointConfig> = {
  1: {
    operations: [4, 58],
    reports: [58, 4, 1, 2],
  },
};

export function getCompanyOperationPickupPoints(companyId: number): number[] | null {
  return companyPickupPointConfigs[companyId]?.operations || null;
}

export function getCompanyReportPickupPoints(companyId: number): number[] | null {
  return companyPickupPointConfigs[companyId]?.reports || null;
}

export function hasPickupPointRestriction(companyId: number): boolean {
  return !!companyPickupPointConfigs[companyId];
}
