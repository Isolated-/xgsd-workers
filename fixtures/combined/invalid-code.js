export default async function worker() {}

async function util() {}

const A = (ctx, next) => {
    // this will fail as await isn't in an async func
    await util()
}

export const middleware = () => [A]