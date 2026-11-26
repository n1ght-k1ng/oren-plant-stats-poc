// Sample companies, plants and users. Safe to run again: existing rows are left as they are.
import { PrismaClient } from "@prisma/client";

import { ROLES, type Role } from "@/lib/roles";
import type { PlantTypeValue } from "@/lib/schemas/plant";
import { updatePlant } from "@/server/services/plant";
import { getSessionUser } from "@/server/services/session";

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

async function seedCompany(seed: SeedCompany) {
	const company = await prisma.company.upsert({ where: { name: seed.name }, create: { name: seed.name }, update: {} });

	for (const plant of seed.plants) {
		const { capacityMt, ...fields } = plant;
		await prisma.plant.upsert({
			where: { companyId_code: { companyId: company.id, code: plant.code } },
			create: { ...fields, cementCapacityTpa: Math.round(capacityMt * 1_000_000), companyId: company.id },
			update: {},
		});
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
	const plant = await prisma.plant.findUniqueOrThrow({ where: { companyId_code: { companyId, code: "P06" } } });
	const hasHistory = await prisma.changeLog.count({ where: { companyId, entityType: "plant", entityId: plant.id } });
	if (hasHistory > 0) {
		return;
	}
	const head = await prisma.user.findUniqueOrThrow({ where: { email: "meera.iyer@nimbuscement.in" } });
	const user = await getSessionUser(prisma, head.id);
	if (!user) {
		throw new Error("Seed user Meera Iyer is missing.");
	}
	await updatePlant(prisma, user, {
		id: plant.id,
		name: plant.name,
		town: plant.town,
		state: plant.state,
		cementCapacityTpa: 3_000_000,
	});
}

async function main() {
	// One at a time, so the sample data comes out the same on every machine.
	const seeded = [];
	for (const seed of COMPANIES) {
		seeded.push(await seedCompany(seed));
	}
	await seedExpansion(seeded[0].id);
	const [companies, plants, users] = await Promise.all([
		prisma.company.count(),
		prisma.plant.count(),
		prisma.user.count(),
	]);
	console.log(`Seeded: ${companies} companies, ${plants} plants, ${users} users.`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
