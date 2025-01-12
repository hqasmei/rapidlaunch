"use server";

import { db } from "@/server/db";
import {
    membersToOrganizations,
    orgRequests,
    organizations,
} from "@/server/db/schema";
import { protectedProcedure } from "@/server/procedures";
import { and, eq } from "drizzle-orm";
import { getOrganizations } from "@/server/actions/organization/queries";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Create a new organization mutations
 * @param name - Name of the organization
 * @param image - Image URL of the organization
 * @returns The created organization
 */

type CreateOrgProps = Omit<typeof organizations.$inferInsert, "id" | "ownerId">;

const createOrgSchema = createInsertSchema(organizations, {
    name: z
        .string()
        .min(3, "Name must be at least 3 characters long")
        .max(50, "Name must be at most 50 characters long"),
    image: z.string().url({ message: "Invalid image URL" }),
});

export async function createOrgMutation({ ...props }: CreateOrgProps) {
    const { user } = await protectedProcedure();

    const organizationParse = await createOrgSchema.safeParseAsync({
        ownerId: user.id,
        ...props,
    });

    if (!organizationParse.success) {
        throw new Error("Invalid organization data", {
            cause: organizationParse.error.errors,
        });
    }

    const createOrg = await db
        .insert(organizations)
        .values(organizationParse.data)
        .returning()
        .execute();

    await db.insert(membersToOrganizations).values({
        memberId: organizationParse.data.ownerId,
        organizationId: createOrg[0]!.id,
        role: "Admin",
    });

    return createOrg[0];
}

/**
 * Update the name of the organization
 * @param name - New name of the organization
 * @returns The updated organization
 */

const updateOrgNameSchema = z.object({
    name: z
        .string()
        .min(3, "Name must be at least 3 characters long")
        .max(50, "Name must be at most 50 characters long"),
});

type UpdateOrgNameProps = z.infer<typeof updateOrgNameSchema>;

export async function updateOrgNameMutation({ name }: UpdateOrgNameProps) {
    const { user } = await protectedProcedure();

    const { currentOrg } = await getOrganizations();

    const organizationNameParse = await updateOrgNameSchema.safeParseAsync({
        name,
    });

    if (!organizationNameParse.success) {
        throw new Error("Invalid organization data", {
            cause: organizationNameParse.error.errors,
        });
    }

    const memToOrg = await db.query.membersToOrganizations.findFirst({
        where: and(
            eq(membersToOrganizations.memberId, user.id),
            eq(membersToOrganizations.organizationId, currentOrg.id),
            eq(membersToOrganizations.role, "Admin"),
        ),
    });

    if (currentOrg.ownerId === user.id || memToOrg) {
        return await db
            .update(organizations)
            .set({ name: organizationNameParse.data.name })
            .where(eq(organizations.id, currentOrg.id))
            .execute();
    }

    throw new Error("You are not an admin of this organization");
}

/**
 * Update the image of the organization
 * @param image - New image URL of the organization
 * @returns The updated organization
 */

const updateOrgImageSchema = z.object({
    image: z.string().url({ message: "Invalid image URL" }),
});

type UpdateOrgImageProps = z.infer<typeof updateOrgImageSchema>;

export async function updateOrgImageMutation({ image }: UpdateOrgImageProps) {
    const { user } = await protectedProcedure();

    const { currentOrg } = await getOrganizations();

    const organizationImageParse = await updateOrgImageSchema.safeParseAsync({
        image,
    });

    if (!organizationImageParse.success) {
        throw new Error("Invalid organization data", {
            cause: organizationImageParse.error.errors,
        });
    }

    const memToOrg = await db.query.membersToOrganizations.findFirst({
        where: and(
            eq(membersToOrganizations.memberId, user.id),
            eq(membersToOrganizations.organizationId, currentOrg.id),
            eq(membersToOrganizations.role, "Admin"),
        ),
    });

    if (currentOrg.ownerId === user.id || memToOrg) {
        return await db
            .update(organizations)
            .set({ image: organizationImageParse.data.image })
            .where(eq(organizations.id, currentOrg.id))
            .execute();
    }

    throw new Error("You are not an admin of this organization");
}

/**
 * Delete the organization
 * @returns The deleted organization
 */

export async function deleteOrgMutation() {
    const { user } = await protectedProcedure();

    const { currentOrg } = await getOrganizations();

    if (currentOrg.ownerId !== user.id) {
        throw new Error("You are not the owner of this organization");
    }

    return await db
        .delete(organizations)
        .where(eq(organizations.id, currentOrg.id))
        .execute();
}

/**
 * Send a request to join an organization
 * @param orgId - ID of the organization
 */

const orgRequestSchema = createInsertSchema(orgRequests);

type OrgRequestProps = {
    orgId: typeof orgRequestSchema._type.organizationId;
};

export async function sendOrgRequestMutation({ orgId }: OrgRequestProps) {
    const { user } = await protectedProcedure();

    const orgRequestParse = await orgRequestSchema.safeParseAsync({
        organizationId: orgId,
        userId: user.id,
    });

    if (!orgRequestParse.success) {
        throw new Error("Invalid organization data", {
            cause: orgRequestParse.error.errors,
        });
    }

    return await db
        .insert(orgRequests)
        .values({
            organizationId: orgRequestParse.data.organizationId,
            userId: orgRequestParse.data.userId,
        })
        .onConflictDoNothing({
            where: and(
                eq(orgRequests.organizationId, orgId),
                eq(orgRequests.userId, user.id),
            ),
        })
        .execute();
}

/**
 * Accept a request to join an organization
 * @param requestId - ID of the request
 */

const acceptOrgRequestSchema = z.object({
    requestId: z.string(),
});

type AcceptOrgRequestProps = z.infer<typeof acceptOrgRequestSchema>;

export async function acceptOrgRequestMutation({
    requestId,
}: AcceptOrgRequestProps) {
    const { user } = await protectedProcedure();

    const { currentOrg } = await getOrganizations();

    const acceptReqParse = await acceptOrgRequestSchema.safeParseAsync({
        requestId,
    });

    if (!acceptReqParse.success) {
        throw new Error("Invalid request data", {
            cause: acceptReqParse.error.errors,
        });
    }

    const memToOrg = await db.query.membersToOrganizations.findFirst({
        where: and(
            eq(membersToOrganizations.memberId, user.id),
            eq(membersToOrganizations.organizationId, currentOrg.id),
            eq(membersToOrganizations.role, "Admin"),
        ),
    });

    if (currentOrg.ownerId === user.id || memToOrg) {
        const request = await db.query.orgRequests.findFirst({
            where: eq(orgRequests.id, acceptReqParse.data.requestId),
        });

        if (!request) {
            throw new Error("Request not found");
        }

        await db.insert(membersToOrganizations).values({
            memberId: request.userId,
            organizationId: currentOrg.id,
        });

        return await db
            .delete(orgRequests)
            .where(eq(orgRequests.id, acceptReqParse.data.requestId))
            .execute();
    }

    throw new Error("You are not an admin of this organization");
}

/**
 * Decline a request to join an organization
 * @param requestId - ID of the request
 */

const declineOrgRequestSchema = z.object({
    requestId: z.string(),
});

type DeclineOrgRequestProps = z.infer<typeof declineOrgRequestSchema>;

export async function declineOrgRequestMutation({
    requestId,
}: DeclineOrgRequestProps) {
    const { user } = await protectedProcedure();

    const { currentOrg } = await getOrganizations();

    const declineReqParse = await declineOrgRequestSchema.safeParseAsync({
        requestId,
    });

    if (!declineReqParse.success) {
        throw new Error("Invalid request data", {
            cause: declineReqParse.error.errors,
        });
    }

    const memToOrg = await db.query.membersToOrganizations.findFirst({
        where: and(
            eq(membersToOrganizations.memberId, user.id),
            eq(membersToOrganizations.organizationId, currentOrg.id),
            eq(membersToOrganizations.role, "Admin"),
        ),
    });

    if (currentOrg.ownerId === user.id || memToOrg) {
        return await db
            .delete(orgRequests)
            .where(eq(orgRequests.id, declineReqParse.data.requestId))
            .execute();
    }

    throw new Error("You are not an admin of this organization");
}

/**
 * Update Member Role
 * @param memberId - Member's id which you want to update
 * @param role - The Role you want to update
 */

const updateMemberRoleZodSchema = createInsertSchema(membersToOrganizations);

const updateMemberRoleSchema = updateMemberRoleZodSchema.pick({
    role: true,
    memberId: true,
});

type UpdateMemberRoleProps = z.infer<typeof updateMemberRoleSchema>;

export async function updateMemberRoleMutation({
    memberId,
    role,
}: UpdateMemberRoleProps) {
    const { user } = await protectedProcedure();

    const { currentOrg } = await getOrganizations();

    const updateMemberRoleParse = await updateMemberRoleSchema.safeParseAsync({
        memberId,
        role,
    });

    if (!updateMemberRoleParse.success) {
        throw new Error("Invalid update member data", {
            cause: updateMemberRoleParse.error.errors,
        });
    }

    const memToOrg = await db.query.membersToOrganizations.findFirst({
        where: and(
            eq(membersToOrganizations.memberId, user.id),
            eq(membersToOrganizations.organizationId, currentOrg.id),
            eq(membersToOrganizations.role, "Admin"),
        ),
    });

    if (
        updateMemberRoleParse.data.role === "Admin" &&
        currentOrg.ownerId !== user.id
    ) {
        throw new Error("You are not the owner of this organization");
    }

    if (currentOrg.ownerId === user.id || memToOrg) {
        return await db
            .update(membersToOrganizations)
            .set({ role: updateMemberRoleParse.data.role })
            .where(
                and(
                    eq(
                        membersToOrganizations.memberId,
                        updateMemberRoleParse.data.memberId,
                    ),
                    eq(membersToOrganizations.organizationId, currentOrg.id),
                ),
            )
            .execute();
    }

    throw new Error("You are not an admin of this organization");
}

/**
 * Remove User from org
 * @param userId - the id of user your want to remove
 */

const removeUserSchema = z.object({
    userId: z.string(),
});

type RemoveUserProps = z.infer<typeof removeUserSchema>;

export async function removeUserMutation({ userId }: RemoveUserProps) {
    const { user } = await protectedProcedure();

    const { currentOrg } = await getOrganizations();

    const removeUserParse = await removeUserSchema.safeParseAsync({
        userId,
    });

    if (!removeUserParse.success) {
        throw new Error("Invalid remove user data", {
            cause: removeUserParse.error.errors,
        });
    }

    const memToOrg = await db.query.membersToOrganizations.findFirst({
        where: and(
            eq(membersToOrganizations.memberId, user.id),
            eq(membersToOrganizations.organizationId, currentOrg.id),
            eq(membersToOrganizations.role, "Admin"),
        ),
    });

    if (currentOrg.ownerId === user.id || memToOrg) {
        return await db
            .delete(membersToOrganizations)
            .where(
                and(
                    eq(
                        membersToOrganizations.memberId,
                        removeUserParse.data.userId,
                    ),
                    eq(membersToOrganizations.organizationId, currentOrg.id),
                ),
            )
            .execute();
    }

    throw new Error("You are not an admin of this organization");
}
