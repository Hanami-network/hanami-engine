.PHONY: build test test-unit test-integration check fmt fmt-check lint clean deploy-devnet idl sdk-build sdk-test cli-build

build:
	anchor build

test:
	anchor test --skip-build

test-unit:
	cargo test --workspace --exclude hanami

test-integration:
	anchor test --skip-build

check:
	cargo check --workspace

fmt:
	cargo fmt --all

fmt-check:
	cargo fmt --all -- --check

lint:
	cargo clippy --workspace --all-targets -- -W warnings

clean:
	cargo clean
	rm -rf .anchor target node_modules sdk/dist

deploy-devnet:
	bash scripts/deploy-devnet.sh

idl:
	cp target/idl/hanami.json idl/hanami.json

sdk-build:
	cd sdk && yarn install && yarn build

sdk-test:
	cd sdk && yarn test

cli-build:
	cargo build --release -p hanami-cli
