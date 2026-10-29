/**
 * Role presets: a CV retitled for the role a company is hiring for, kept in Workers KV so Mia can add
 * one without a deploy. A preset replaces the title, and the skills when it lists its own; nothing
 * else about the CV changes.
 */
import { cv, type CV } from './content';

/** Keys Mia hands out in links, like `?role=support-lead`. Anything else is not looked up. */
export const ROLE_KEY = /^[a-z0-9-]{1,64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** A preset as stored: JSON `{ title, skills? }`, skills in the CV's own shape. Anything else is no preset. */
function parse(raw: string): (Pick<CV, 'title'> & Partial<Pick<CV, 'skills'>>) | undefined {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return undefined;
    }
    if (!isRecord(value) || typeof value.title !== 'string' || !value.title.trim()) return undefined;
    const title = value.title.trim();
    if (value.skills === undefined) return { title };
    const skills = value.skills;
    // Areas name the CV's rows, so each appears once.
    const valid =
        Array.isArray(skills) &&
        skills.length > 0 &&
        skills.every((skill) => isRecord(skill) && typeof skill.area === 'string' && typeof skill.items === 'string') &&
        new Set(skills.map(({ area }) => area)).size === skills.length;
    return valid ? { title, skills: skills.map(({ area, items }) => ({ area, items })) } : undefined;
}

/**
 * The CV to render for a preset's raw KV value. A missing key or value, or a malformed one, gives
 * the default CV, so a typo in a shared link never breaks it.
 */
export function resolveCV(raw: string | null | undefined): CV {
    const preset = raw ? parse(raw) : undefined;
    return preset ? { ...cv, ...preset } : cv;
}
