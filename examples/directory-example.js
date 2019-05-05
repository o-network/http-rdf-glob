const { graph, parse, Namespace } = require("rdflib"),
  fs = require("fs");

(async () => {

  const resourceGraph = graph();

  const resource = fs.readFileSync("./directory-example.json", "utf-8");

  const url = "https://example.com/directory/";

  await new Promise(
    (resolve, reject) => parse(
      resource,
      resourceGraph,
      url,
      "application/ld+json",
      (error) => error ? reject(error) : resolve()
    )
  );

  const dir = resourceGraph.sym(url);

  const ldp = Namespace("http://www.w3.org/ns/ldp#");

  const found = resourceGraph.match(dir, ldp("contains"));

  console.log({ found: found.map(value => value.object.value) });

})();
