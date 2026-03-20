# PAA MVP Build

This directory contains the primer-constrained MVP runtime.

## Local Docker Model Option

One offline Docker-local model path is:

1. Run the local model server on the owner host, for example on `127.0.0.1:11434`.
2. Build the image:

```bash
docker build -t paa-mvp-build .
```

3. Start the container with an explicit host mapping and a mounted working copy of `build/` data:

```bash
docker run --rm -it \
  --add-host host.docker.internal:host-gateway \
  -v "$PWD":/workspace \
  -w /workspace \
  paa-mvp-build
```

4. Set adapter config `base_url` to `http://host.docker.internal:11434/v1` for the containerized runtime.

This keeps the model path local to owner-controlled hardware and does not require internet connectivity.
