import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseAllDocuments } from "yaml";

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

test("jenkins builds images, imports them into k3s, and applies the desk", () => {
  const jenkins = readFileSync("Jenkinsfile", "utf8");
  assert.match(jenkins, /docker build -f apps\/web\/Dockerfile/);
  assert.match(jenkins, /docker build -f apps\/api\/Dockerfile/);
  assert.match(jenkins, /docker build -f apps\/worker\/Dockerfile/);
  assert.match(jenkins, /k3s ctr images import/);
  assert.match(jenkins, /apply -f k8s\//);
  assert.match(jenkins, /set image deployment\/atrium-web atrium-web=atrium-web:\$\{IMAGE_TAG\}/);
  assert.match(jenkins, /k3s kubectl/);
  assert.equal(jenkins.includes("docker push"), false);
  assert.equal(jenkins.includes("9173"), false);
});

test("kubernetes workloads expose the desk ports and keep probes and limits", () => {
  const files = walk("k8s");
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
      assert.equal(container.imagePullPolicy, "IfNotPresent");
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
  assert.equal(web.spec.replicas, 1);
  assert.equal(api.spec.replicas, 1);
  assert.equal(worker.spec.replicas, 1);
  const webService = docs.find((doc) => doc.kind === "Service" && doc.metadata.name === "atrium-web");
  assert.equal(webService.spec.type, "NodePort");
  assert.equal(webService.spec.ports[0].nodePort, 30080);
  const ingress = docs.find((doc) => doc.kind === "Ingress");
  const paths = ingress.spec.rules[0].http.paths.map((path) => path.path);
  assert.deepEqual(paths, ["/api", "/"]);
});
