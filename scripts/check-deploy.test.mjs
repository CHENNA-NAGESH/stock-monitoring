import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parse, parseAllDocuments } from "yaml";

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) files.push(path);
  }
  return files;
}

test("the desk dev server is fixed on port 9180", () => {
  const vite = readFileSync("apps/web/vite.config.ts", "utf8");
  assert.match(vite, /port:\s*9180/);
  assert.match(vite, /strictPort:\s*true/);
  assert.equal(vite.includes("9173"), false);
});

test("pull requests build images without publishing or deploying", () => {
  const doc = parse(readFileSync("bitbucket-pipelines.yml", "utf8"));
  const pullRequest = JSON.stringify(doc.pipelines["pull-requests"]["**"]);
  assert.match(pullRequest, /npm test/);
  assert.match(pullRequest, /docker build/);
  assert.equal(pullRequest.includes("docker push"), false);
  assert.equal(pullRequest.includes("kubectl"), false);
  const promote = JSON.stringify(doc.pipelines.custom.promote);
  assert.equal(promote.includes("docker build"), false);
  assert.equal(promote.includes("docker push"), false);
  assert.match(promote, /docker manifest inspect/);
  assert.match(promote, /atrium-prod/);
  const main = JSON.stringify(doc.pipelines.branches.main);
  assert.match(main, /docker push/);
  assert.match(main, /atrium-staging/);
});

test("kubernetes workloads expose the desk ports and keep probes and limits", () => {
  const files = walk("deploy");
  assert.equal(files.some((file) => file.includes("9173")), false);
  const docs = files.flatMap((file) =>
    parseAllDocuments(readFileSync(file, "utf8"))
      .map((doc) => doc.toJSON())
      .filter(Boolean),
  );
  const text = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.equal(text.includes("9173"), false);
  const workloads = docs.filter((doc) => doc.kind === "Deployment" || doc.kind === "StatefulSet");
  assert.ok(workloads.length >= 5);
  for (const workload of workloads) {
    const containers = workload.spec.template.spec.containers;
    assert.ok(containers.length > 0);
    for (const container of containers) {
      assert.ok(container.resources.requests.cpu);
      assert.ok(container.resources.requests.memory);
      assert.ok(container.resources.limits.cpu);
      assert.ok(container.resources.limits.memory);
      assert.ok(container.readinessProbe);
      assert.ok(container.livenessProbe);
    }
  }
  const web = workloads.find((doc) => doc.metadata.name === "atrium-web");
  const api = workloads.find((doc) => doc.metadata.name === "atrium-api");
  const worker = workloads.find((doc) => doc.metadata.name === "atrium-worker");
  assert.equal(web.spec.template.spec.containers[0].ports[0].containerPort, 8080);
  assert.equal(api.spec.template.spec.containers[0].ports[0].containerPort, 8081);
  assert.equal(worker.spec.template.spec.containers[0].ports[0].containerPort, 8082);
  assert.equal(web.spec.replicas, 2);
  assert.equal(api.spec.replicas, 2);
  assert.equal(worker.spec.replicas, 1);
  const ingress = docs.find((doc) => doc.kind === "Ingress");
  const paths = ingress.spec.rules[0].http.paths.map((path) => path.path);
  assert.deepEqual(paths, ["/api", "/"]);
  const staging = parse(readFileSync("deploy/overlays/staging/kustomization.yaml", "utf8"));
  const production = parse(readFileSync("deploy/overlays/production/kustomization.yaml", "utf8"));
  assert.equal(staging.namespace, "atrium-staging");
  assert.equal(production.namespace, "atrium-prod");
  assert.match(readFileSync("deploy/overlays/staging/ingress-host.yaml", "utf8"), /atrium\.staging\.example\.com/);
});
