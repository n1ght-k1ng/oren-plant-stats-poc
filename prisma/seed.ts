// Sample companies, plants and users. Safe to run again: existing rows are left as they are.
import { PrismaClient } from "@prisma/client";

import { FIRST_REPORTING_PERIOD } from "@/config/reporting";
import { ROLES, type Role } from "@/lib/roles";
import type { PlantTypeValue } from "@/lib/schemas/plant";
import { recordCapacity } from "@/server/services/capacity";

import { updatePlant } from "@/server/services/plant";
import { getSessionUser } from "@/server/services/session";
import { seedDemoMonths } from "./demo";

const prisma = new PrismaClient();

type SeedPlant = { code: string; name: string; town: string; state: string; type: PlantTypeValue; capacityMt: number };
type SeedUser = { name: string; email: string; roles: Role[]; plantCodes?: string[] };
type SeedCompany = { name: string; plants: SeedPlant[]; users: SeedUser[] };

const COMPANIES: SeedCompany[] = [
	{
		name: "Nimbus Cement Ltd",
		plants: [
			{
				code: "P01",
				name: "Nimbus Chittorgarh Works",
				town: "Chittorgarh",
				state: "Rajasthan",
				type: "INTEGRATED",
				capacityMt: 4.0,
			},
			{
				code: "P02",
				name: "Nimbus Satna Works",
				town: "Satna",
				state: "Madhya Pradesh",
				type: "INTEGRATED",
				capacityMt: 3.5,
			},
			{
				code: "P03",
				name: "Nimbus Chandrapur Works",
				town: "Chandrapur",
				state: "Maharashtra",
				type: "INTEGRATED",
				capacityMt: 3.0,
			},
			{
				code: "P04",
				name: "Nimbus Nalgonda Works",
				town: "Nalgonda",
				state: "Telangana",
				type: "INTEGRATED",
				capacityMt: 2.5,
			},
			{
				code: "P05",
				name: "Nimbus Ariyalur Works",
				town: "Ariyalur",
				state: "Tamil Nadu",
				type: "INTEGRATED",
				capacityMt: 2.0,
			},
			{
				code: "P06",
				name: "Nimbus Baloda Bazar Works",
				town: "Baloda Bazar",
				state: "Chhattisgarh",
				type: "INTEGRATED",
				capacityMt: 2.5,
			},
			{
				code: "P07",
				name: "Nimbus Mundra Grinding Unit",
				town: "Mundra",
				state: "Gujarat",
				type: "GRINDING_UNIT",
				capacityMt: 2.0,
			},
			{
				code: "P08",
				name: "Nimbus Paradip Grinding Unit",
				town: "Paradip",
				state: "Odisha",
				type: "GRINDING_UNIT",
				capacityMt: 1.5,
			},
			{
				code: "P09",
				name: "Nimbus Durgapur Grinding Unit",
				town: "Durgapur",
				state: "West Bengal",
				type: "GRINDING_UNIT",
				capacityMt: 1.5,
			},
		],
		users: [
			{ name: "Ravi Meena", email: "ravi.meena@nimbuscement.in", roles: [ROLES.DATA_OWNER], plantCodes: ["P01"] },
			{ name: "Anita Tiwari", email: "anita.tiwari@nimbuscement.in", roles: [ROLES.DATA_OWNER], plantCodes: ["P02"] },
			{
				name: "Suresh Wankhede",
				email: "suresh.wankhede@nimbuscement.in",
				roles: [ROLES.DATA_OWNER],
				plantCodes: ["P03"],
			},
			{ name: "Lakshmi Reddy", email: "lakshmi.reddy@nimbuscement.in", roles: [ROLES.DATA_OWNER], plantCodes: ["P04"] },
			{ name: "Karthik Raja", email: "karthik.raja@nimbuscement.in", roles: [ROLES.DATA_OWNER], plantCodes: ["P05"] },
			{ name: "Deepak Sahu", email: "deepak.sahu@nimbuscement.in", roles: [ROLES.DATA_OWNER], plantCodes: ["P06"] },
			{ name: "Hetal Patel", email: "hetal.patel@nimbuscement.in", roles: [ROLES.DATA_OWNER], plantCodes: ["P07"] },
			{
				name: "Sasmita Mohanty",
				email: "sasmita.mohanty@nimbuscement.in",
				roles: [ROLES.DATA_OWNER],
				plantCodes: ["P08"],
			},
			{ name: "Arijit Ghosh", email: "arijit.ghosh@nimbuscement.in", roles: [ROLES.DATA_OWNER], plantCodes: ["P09"] },
			{
				name: "Priya Nair",
				email: "priya.nair@nimbuscement.in",
				roles: [ROLES.REVIEWER, ROLES.DATA_OWNER],
				plantCodes: ["P05"],
			},
			{ name: "Vikram Joshi", email: "vikram.joshi@nimbuscement.in", roles: [ROLES.REVIEWER] },
			{ name: "Meera Iyer", email: "meera.iyer@nimbuscement.in", roles: [ROLES.SUSTAINABILITY_HEAD] },
		],
	},
	{
		name: "Kestrel Cement Ltd",
		plants: [
			{
				code: "P01",
				name: "Kestrel Bhiwani Works",
				town: "Bhiwani",
				state: "Haryana",
				type: "INTEGRATED",
				capacityMt: 2.5,
			},
			{
				code: "P02",
				name: "Kestrel Kurnool Grinding Unit",
				town: "Kurnool",
				state: "Andhra Pradesh",
				type: "GRINDING_UNIT",
				capacityMt: 1.0,
			},
		],
		users: [{ name: "Rohan Kapoor", email: "rohan.kapoor@kestrelcement.in", roles: [ROLES.SUSTAINABILITY_HEAD] }],
	},
];

/**
 * P06's expansion from 2.5 to 3.0 Mt a year. The starter does not say when it took effect, so October 2026 is
 * an assumption (docs/DECISIONS.md A8).
 */
const P06_EXPANSION = { code: "P06", effectiveFrom: "2026-10", cementCapacityTpa: 3_000_000 };

async function seedCompany(seed: SeedCompany) {
	const company = await prisma.company.upsert({ where: { name: seed.name }, create: { name: seed.name }, update: {} });

	for (const plant of seed.plants) {
		const { capacityMt, ...fields } = plant;
		const cementCapacityTpa = Math.round(capacityMt * 1_000_000);
		const saved = await prisma.plant.upsert({
			where: { companyId_code: { companyId: company.id, code: plant.code } },
			create: { ...fields, cementCapacityTpa, companyId: company.id },
			update: {},
		});
		// Capacity history (C1): the seeded capacity from the first reporting month. Left alone if present.
		const existing = await prisma.plantCapacity.findUnique({
			where: { plantId_effectiveFrom: { plantId: saved.id, effectiveFrom: FIRST_REPORTING_PERIOD } },
		});
		if (!existing) {
			await recordCapacity(prisma, {
				companyId: company.id,
				plantId: saved.id,
				effectiveFrom: FIRST_REPORTING_PERIOD,
				cementCapacityTpa,
				createdById: null,
			});
		}
	}

	for (const user of seed.users) {
		const { plantCodes = [], ...fields } = user;
		await prisma.user.upsert({
			where: { email: user.email },
			create: {
				...fields,
				companyId: company.id,
				plants: { connect: plantCodes.map((code) => ({ companyId_code: { companyId: company.id, code } })) },
			},
			update: {},
		});
	}
	return company;
}

/** One recorded change, so the plant page has some history: P06 was expanded from 2.5 to 3.0 Mt a year. */
async function seedExpansion(companyId: string) {
	const plant = await prisma.plant.findUniqueOrThrow({
		where: { companyId_code: { companyId, code: P06_EXPANSION.code } },
	});
	// The history row is written even on a database seeded before capacity history existed.
	const expansion = await prisma.plantCapacity.findUnique({
		where: { plantId_effectiveFrom: { plantId: plant.id, effectiveFrom: P06_EXPANSION.effectiveFrom } },
	});
	if (!expansion) {
		await recordCapacity(prisma, {
			companyId,
			plantId: plant.id,
			effectiveFrom: P06_EXPANSION.effectiveFrom,
			cementCapacityTpa: P06_EXPANSION.cementCapacityTpa,
			createdById: null,
		});
	}
	const hasHistory = await prisma.changeLog.count({ where: { companyId, entityType: "plant", entityId: plant.id } });
	if (hasHistory > 0) {
		return;
	}
	const head = await prisma.user.findUniqueOrThrow({ where: { email: "meera.iyer@nimbuscement.in" } });
	const user = await getSessionUser(prisma, head.id);
	if (!user) {
		throw new Error("Seed user Meera Iyer is missing.");
	}
	await updatePlant(
		prisma,
		user,
		{
			id: plant.id,
			name: plant.name,
			town: plant.town,
			state: plant.state,
			cementCapacityTpa: P06_EXPANSION.cementCapacityTpa,
		},
		{ capacityEffectiveFrom: P06_EXPANSION.effectiveFrom },
	);
}

async function main() {
	// One at a time, so the sample data comes out the same on every machine.
	const seeded = [];
	for (const seed of COMPANIES) {
		seeded.push(await seedCompany(seed));
	}
	await seedExpansion(seeded[0].id);
	// Demo months for Nimbus: April to October 2026. Existing months are left as they are.
	const demo = await seedDemoMonths(prisma, seeded[0].id);
	const [companies, plants, users] = await Promise.all([
		prisma.company.count(),
		prisma.plant.count(),
		prisma.user.count(),
	]);
	console.log(`Seeded: ${companies} companies, ${plants} plants, ${users} users.`);
	console.log(`Demo months: ${demo.created} created, ${demo.skipped} already there and left as they are.`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
